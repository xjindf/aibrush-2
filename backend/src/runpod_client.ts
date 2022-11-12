import * as axios from "axios";

export const RUNPOD_TEMPLATE_ID = process.env.RUNPOD_TEMPLATE_ID;

export interface GpuTypesInput {
    id: "NVIDIA GeForce RTX 3090" | "NVIDIA RTX A5000" | "NVIDIA RTX A6000" | "NVIDIA A100 80GB PCIe";
}

export interface LowestPriceInput {
    gpuCount: number;
    minDownload: number;
    minMemoryInGb: number;
    minUpload: number;
    minVcpuCount: number;
    secureCloud: boolean;
    supportPublicIp?: boolean;
}

export interface GPULowestPrice {
    minimumBidPrice: number;
    uninterruptablePrice: number;
    minVcpu: number;
    minMemory: number;
    stockStatus: "High" | "Medium" | "Low" | null;
}

export interface GPUType {
    lowestPrice: GPULowestPrice;
    maxGpuCount: number;
    id: "NVIDIA GeForce RTX 3090" | "NVIDIA RTX A5000" | "NVIDIA RTX A6000";
    displayName: string;
    memoryInGb: number;
    communityPrice: number;
    securePrice: number;
}

export interface GpuTypesResult {
    gpuTypes: GPUType[];
}

export interface CreatePodInput {
    cloudType: "SECURE" | "COMMUNITY" | "ALL";
    gpuCount: number;
    volumeInGb: number;
    containerDiskInGb: number;
    minVcpuCount: number;
    minMemoryInGb: number;
    gpuTypeId: string;
    name: string;
    imageName: string;
    dockerArgs: string;
    ports: string;
    volumeMountPath: string;
    env: Array<{key: string, value: string}>;
    templateId: string;
}

interface CreatePodResult {
    id: string;
    imageName: string;
    env: Array<string>;
    machineId: string;
    machine: {
        podHostId: string;
    };
}

export interface PodPort {
    ip: string;
    isIpPublic: boolean;
    privatePort: number;
    publicPort: number;
    type: string;
}

export interface PodGpu {
    id: string;
    gpuUtilPercent: number;
    memoryUtilPercent: number;
}

export interface PodContainer {
    cpuPercent: number;
    memoryPercent: number;
}

export interface PodRuntime {
    uptimeInSeconds: number;
    ports: Array<PodPort>;
    gpus: Array<PodGpu>;
    container: PodContainer;
}

export interface Pod {
    id: string;
    name: string;
    runtime: PodRuntime;
}

export interface PodsResult {
    myself: {
        pods: Array<Pod>;
    };
}

export interface PodTerminateInput {
    podId: string;
}

export interface PodTerminateResult {
    podTerminate: any;
}

export class RunpodApi {
    constructor(private apiKey: string) {}

    async getCommunityGpuTypes(gpuTypesInput: GpuTypesInput, lowestPriceInput: LowestPriceInput): Promise<GpuTypesResult> {
        const url = `https://api.runpod.io/graphql?api_key=${this.apiKey}`;
        const r = await axios.default.post(
            url,
            {
                query: `query CommunityGpuTypes($lowestPriceInput: GpuLowestPriceInput, $gpuTypesInput: GpuTypeFilter) {\n  gpuTypes(input: $gpuTypesInput) {\n    lowestPrice(input: $lowestPriceInput) {\n      minimumBidPrice\n      uninterruptablePrice\n      minVcpu\n      minMemory\n      stockStatus\n      __typename\n    }\n    maxGpuCount\n    id\n    displayName\n    memoryInGb\n    communityPrice\n    securePrice\n    __typename\n  }\n}`,
                variables: {
                    gpuTypesInput,
                    lowestPriceInput,
                },
                operationName: "CommunityGpuTypes",
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return (r.data as any).data;
    }

    async terminatePod(input: PodTerminateInput): Promise<void> {
        const url = `https://api.runpod.io/graphql?api_key=${this.apiKey}`;
        const r = await axios.default.post(
            url,
            {
                query: `
                    mutation {
                        podTerminate(input: {
                            podId: "${input.podId}"
                        })
                    }
                `,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }

    async getMyPods(): Promise<PodsResult> {
        const url = `https://api.runpod.io/graphql?api_key=${this.apiKey}`;
        const r = await axios.default.post(
            url,
            {
                query: `query { myself { pods { id name runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } gpus { id gpuUtilPercent memoryUtilPercent } container { cpuPercent memoryPercent } } } } }`,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return (r.data as any).data;
    }

    async createPod(input: CreatePodInput): Promise<CreatePodResult> {
        const url = `https://api.runpod.io/graphql?api_key=${this.apiKey}`;
        const r = await axios.default.post(
            url,
            {
                query: `mutation { podFindAndDeployOnDemand( input: { cloudType: ${input.cloudType}, gpuCount: ${input.gpuCount}, volumeInGb: ${input.volumeInGb}, containerDiskInGb: ${input.containerDiskInGb}, minVcpuCount: ${input.minVcpuCount}, minMemoryInGb: ${input.minMemoryInGb}, gpuTypeId: "${input.gpuTypeId}", name: "${input.name}", imageName: "${input.imageName}", dockerArgs: "${input.dockerArgs}", ports: "${input.ports}", volumeMountPath: "${input.volumeMountPath}", env: [${input.env.map((e) => `{ key: "${e.key}", value: "${e.value}" }`).join(", ")}] } ) { id imageName env machineId machine { podHostId } } }`,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return (r.data as any).data;
    }
}
