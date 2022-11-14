import moment from "moment";
import { Clock } from "./clock";

export const SCALEDOWN_COOLDOWN = moment.duration(10, "minutes");
export const WORKER_TIMEOUT = moment.duration(10, "minutes");

// TODO: find a way to reuse vast.ai engine logic

export interface ScalingOperation {
    targetId: string;
    operationType: "create" | "destroy";
    gpuCount?: number;
    block?: boolean;
}

export interface GPULowestPrice {
    uninterruptablePrice: number;
    stockStatus: "High" | "Medium" | "Low" | null;
}

export interface GPUType {
    lowestPrice: GPULowestPrice;
    maxGpuCount: number;
    id: "NVIDIA GeForce RTX 3090" | "NVIDIA RTX A5000" | "NVIDIA RTX A6000";
}

// const MAX_COST_PER_GPU_MAP = {
//     "NVIDIA GeForce RTX 3090": 0.55,
//     "NVIDIA RTX A5000": 0.55,
//     "NVIDIA RTX A6000": 0.85,
// };

const GPU_PER_ORDER_MULTIPLIERS = {
    "NVIDIA GeForce RTX 3090": 2,
    "NVIDIA RTX A5000": 2,
    "NVIDIA RTX A6000": 1,
};

// Runpod support indicated that the "Low", "Medium" and "High"
// availability mapped to 1-5, 6-15 and 16-30+ instances respectively.
// Use pessimistic mapping to try to avoid renting out machines
// that aren't available.
const AVAILABILITY_MAP = {
    Low: 1,
    Medium: 5,
    High: 15,
};

export interface Worker {
    id: string;
    num_gpus?: number;
    created_at: number;
    last_ping?: number;
}

export function calculateScalingOperations(
    workers: Worker[],
    gpuTypes: GPUType[],
    targetGpus: number,
    lastScalingOperation: moment.Moment,
    clock: Clock
): Array<ScalingOperation> {
    // add up the number of gpus in the workers (some may be null if not deployed)
    let numGpus = 0;
    const operations: Array<ScalingOperation> = [];
    for (const worker of workers) {
        const now = clock.now().valueOf();
        if (
            now - (worker.last_ping || worker.created_at) >
            WORKER_TIMEOUT.asMilliseconds()
        ) {
            console.log(`Worker ${worker.id} timed out`);
            // TODO: emit a metric for this?
            operations.push({
                targetId: worker.id,
                operationType: "destroy",
                block: true,
            });
        } else if (worker.num_gpus) {
            numGpus += worker.num_gpus;
        }
    }
    // if we are at the target, no scaling operations
    if (numGpus === targetGpus) {
        return operations;
    }

    if (numGpus > targetGpus) {
        if (
            clock.now().diff(lastScalingOperation, "milliseconds") >=
            SCALEDOWN_COOLDOWN.asMilliseconds()
        ) {
            scaleDown(workers, numGpus, targetGpus, operations);
        }
    } else {
        scaleUp(gpuTypes, numGpus, targetGpus, operations);
    }
    return operations;
}

function scaleDown(
    workers: Worker[],
    numGpus: number,
    targetGpus: number,
    operations: ScalingOperation[]
) {
    // if we are above the target, scale down but not below the target.
    const workersByGPUCount = {};
    for (const worker of workers) {
        if (worker.num_gpus) {
            if (!workersByGPUCount[worker.num_gpus]) {
                workersByGPUCount[worker.num_gpus] = [];
            }
            workersByGPUCount[worker.num_gpus].push(worker);
        }
    }
    // sort by gpu count in descending order
    const gpuCounts = Object.keys(workersByGPUCount)
        .map((x) => parseInt(x))
        .sort((a, b) => b - a);
    let completed = false;
    while (!completed) {
        let destroyed = false;
        for (const gpuCount of gpuCounts) {
            const workers = workersByGPUCount[gpuCount];
            if (workers.length > 0 && numGpus - gpuCount >= targetGpus) {
                const worker = workers.pop();
                operations.push({
                    targetId: worker.id,
                    operationType: "destroy",
                });
                numGpus -= gpuCount;
                destroyed = true;
                if (numGpus === targetGpus) {
                    completed = true;
                }
                break;
            }
        }
        // if we didn't destroy anything, we are done
        if (!destroyed) {
            completed = true;
        }
    }
    return numGpus;
}

function scaleUp(
    gpuTypes: GPUType[],
    numGpus: number,
    targetGpus: number,
    operations: ScalingOperation[]
) {
    if (gpuTypes.length === 0) {
        return;
    }
    const availabilityByGPUCount: { [key: number]: number } = {};
    const gpuId = gpuTypes[0].id;
    for (const gpuType of gpuTypes) {
        if (gpuType.lowestPrice.stockStatus) {
            availabilityByGPUCount[gpuType.maxGpuCount] =
                AVAILABILITY_MAP[gpuType.lowestPrice.stockStatus];
        }
    }
    // sort by gpu count in ascending order
    const gpuCounts = Object.keys(availabilityByGPUCount)
        .map((x) => parseInt(x))
        .sort((a, b) => a - b);
    let completed = false;
    while (!completed) {
        let gpuSize = 0;
        for (const gpuCount of gpuCounts) {
            console.log("gpuCount", gpuCount);
            const availability = availabilityByGPUCount[gpuCount];
            if (availability > 0 && numGpus < targetGpus) {
                gpuSize = gpuCount;
                if (numGpus + gpuCount >= targetGpus) {
                    completed = true;

                    console.log("Adding gpuSize(completed)", gpuSize);
                    operations.push({
                        targetId: gpuId,
                        operationType: "create",
                        gpuCount: gpuSize,
                    });
                    availabilityByGPUCount[gpuCount] -= 1;
                    break;
                }
            }
        }
        if (!completed) {
            if (gpuSize == 0) {
                completed = true;
                console.log("offers exhausted");
            } else {
                availabilityByGPUCount[gpuSize] -= 1;
                numGpus += gpuSize;
                console.log("Adding gpuSize(not completed)", gpuSize);
                operations.push({
                    targetId: gpuId,
                    operationType: "create",
                    gpuCount: gpuSize,
                });
            }
        }
    }
}