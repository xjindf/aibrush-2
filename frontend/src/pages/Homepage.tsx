// V2 page
import React, { FC, useState, useEffect } from "react";
import Dropdown from "react-bootstrap/Dropdown";
import { useParams, useHistory, Link } from "react-router-dom";
import moment from "moment";
import ScrollToTop from "react-scroll-to-top";
import { AIBrushApi } from "../client";
import { CreateImageInput, Image, ImageStatusEnum } from "../client/api";
import { ImageThumbnail } from "../components/ImageThumbnail";
import { ImagePrompt, defaultArgs } from "../components/ImagePrompt";

import InfiniteScroll from "react-infinite-scroll-component";
import { ImagePopup } from "../components/ImagePopup";
import { BusyModal } from "../components/BusyModal";
import { PendingImagesThumbnail } from "../components/PendingImagesThumbnail";
import { PendingImages } from "../components/PendingImages";

interface Props {
    api: AIBrushApi;
    assetsUrl: string;
}

export const Homepage: FC<Props> = ({ api, assetsUrl }) => {
    const [creating, setCreating] = useState(false);
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);
    const [parentImage, setParentImage] = useState<Image | null>(null);

    const [showPendingImages, setShowPendingImages] = useState(false);

    const [images, setImages] = useState<Array<Image>>([]);
    const [err, setErr] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [search, setSearch] = useState<string>("");
    const [searchDebounce, setSearchDebounce] = useState<string>("");

    const [bulkDeleteSelecting, setBulkDeleteSelecting] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkDeleteIds, setBulkDeleteIds] = useState<{
        [key: string]: boolean;
    }>({});

    const { id } = useParams<{ id?: string }>();
    const history = useHistory();

    useEffect(() => {
        let handle = setTimeout(() => {
            setSearch(searchDebounce);
        }, 500);
        return () => {
            clearTimeout(handle);
        };
    }, [searchDebounce]);

    useEffect(() => {
        if (id) {
            // check if the image is already loaded
            const image = images.find((image) => image.id === id);
            if (image) {
                setSelectedImage(image);
            }
            // refresh
            api.getImage(id).then((image) => {
                setSelectedImage(image.data);
            });
        } else {
            setSelectedImage(null);
        }
    }, [id]);

    const onSubmit = async (input: CreateImageInput) => {
        setCreating(true);
        setParentImage(null);
        setErr(null);
        window.scrollTo(0, 0);
        try {
            await api.createImage(input);
        } catch (e: any) {
            console.error(e);
            setErr("Error creating image");
        } finally {
            setCreating(false);
        }
    };

    const onEditNewImage = async (input: CreateImageInput) => {
        setCreating(true);
        setParentImage(null);
        setErr(null);
        window.scrollTo(0, 0);
        try {
            const newImages = await api.createImage(input);
            if (newImages.data.images) {
                const image = newImages.data.images![0];
                history.push(`/image-editor/${image.id}`);
            }
        } catch (e: any) {
            console.error(e);
            setErr("Error creating image");
        } finally {
            setCreating(false);
        }
    };

    const onNSFW = (image: Image, nsfw: boolean) => {
        api.updateImage(image.id, { nsfw }).then((res) => {
            setImages((images) => {
                return images.map((i) => {
                    if (i.id === image.id) {
                        return res.data;
                    }
                    return i;
                });
            });
            setSelectedImage(res.data);
        });
    };

    const onUpscale = async (image: Image) => {
        setCreating(true);
        setErr(null);
        window.scrollTo(0, 0);
        try {
            const imageInput = defaultArgs();
            imageInput.parent = image.id;
            imageInput.label = image.label;
            imageInput.phrases = image.phrases;
            imageInput.negative_phrases = image.negative_phrases;
            imageInput.width = image.width! * 2;
            imageInput.height = image.height! * 2;
            imageInput.model = "swinir";
            imageInput.count = 1;

            const newImages = await api.createImage(imageInput);
            setImages((images) => {
                // there is a race condition where poll images can fire before this callback
                // so double-check to avoid duplicates
                const imagesToAdd = (newImages.data.images || []).filter(
                    (image) => {
                        return !images.find((i) => i.id === image.id);
                    }
                );
                return [...imagesToAdd, ...images].sort(sortImages);
            });
            history.push("/");
        } catch (e: any) {
            console.error(e);
            setErr("Error creating image");
        } finally {
            setCreating(false);
        }
    };

    useEffect(() => {
        if (!api) {
            return;
        }
        const loadImages = async () => {
            console.log("Initial load images");
            // clear error
            setErr(null);
            setHasMore(true);
            try {
                const cursor = moment().add(1, "minutes").valueOf();
                const resp = await api.listImages(cursor, search, 100, "desc");
                if (resp.data.images) {
                    console.log("Initial load images", resp.data.images.length);
                    setImages(
                        resp.data.images
                            .filter((image) => !image.deleted_at)
                            .sort(sortImages)
                    );
                }
                return 0;
            } catch (err) {
                setErr("Could not load images");
                console.error(err);
            }
        };
        loadImages();
    }, [api, search]);

    useEffect(() => {
        if (!api) {
            return;
        }

        const pollImages = async (images: Array<Image>) => {
            // clear error
            setErr(null);
            // set cursor to max updated_at from images
            const cursor = images.reduce((max, image) => {
                return Math.max(max, image.updated_at);
            }, 0);

            try {
                const resp = await api.listImages(
                    cursor + 1,
                    search,
                    100,
                    "asc"
                );
                if (resp.data.images) {
                    let latestCursor = cursor;
                    for (let image of resp.data.images) {
                        if (image.updated_at > latestCursor) {
                            latestCursor = image.updated_at;
                        }
                    }

                    // split resp.data.images into "new" and "updated" lists
                    // image is "new" if it's not in images
                    const newImages = resp.data.images.filter((image) => {
                        return images.findIndex((i) => i.id === image.id) < 0;
                    });
                    const updatedImages = resp.data.images.filter((image) => {
                        return images.findIndex((i) => i.id === image.id) >= 0;
                    });
                    setImages((images) => {
                        const deletedIds: { [key: string]: boolean } = {};
                        for (let image of newImages) {
                            if (image.deleted_at) {
                                deletedIds[image.id] = true;
                                console.log(
                                    `Deleting image ${image.id} from list`
                                );
                            }
                        }
                        for (let image of updatedImages) {
                            if (image.deleted_at) {
                                deletedIds[image.id] = true;
                                console.log(
                                    `Deleting image ${image.id} from list`
                                );
                            }
                        }
                        images = images.filter(
                            (image) => !deletedIds[image.id]
                        );
                        return [
                            ...images.map((image) => {
                                const updatedImage = updatedImages.find(
                                    (i) => i.id === image.id
                                );
                                if (updatedImage) {
                                    return updatedImage;
                                }
                                return image;
                            }),
                            ...newImages.filter((image) => !image.deleted_at),
                        ].sort(sortImages);
                    });
                }
                return images;
            } catch (err) {
                setErr("Could not load images");
                console.error(err);
            }
        };

        const timerHandle = setInterval(() => {
            pollImages(images);
        }, 5000);
        return () => {
            clearInterval(timerHandle);
        };
    }, [api, images, search]);

    useEffect(() => {
        // de-duplicate images by id
        // first check if there are any duplicates
        // I know, I should figure out where the duplicates are coming from,
        // but I'm lazy.
        const ids = images.map((image) => image.id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
            setImages((images) => {
                // there are duplicates
                const uniqueImages = images.filter((image, index) => {
                    return ids.indexOf(image.id) === index;
                });
                return uniqueImages.sort(sortImages);
            });
        }
    }, [images]);

    const isPendingOrProcessing = (image: Image) => {
        return (
            image.status === ImageStatusEnum.Pending ||
            image.status === ImageStatusEnum.Processing
        );
    };

    const sortImages = (a: Image, b: Image) => {
        // pending and processing images always come first
        if (isPendingOrProcessing(a) && !isPendingOrProcessing(b)) {
            return -1;
        } else if (!isPendingOrProcessing(a) && isPendingOrProcessing(b)) {
            return 1;
        }
        // if the parent is the same, sort by score descending
        // otherwise, sort by updated_at
        if (
            a.parent === b.parent &&
            a.phrases.join("|") == b.phrases.join("|") &&
            a.status !== ImageStatusEnum.Pending &&
            b.status !== ImageStatusEnum.Pending
        ) {
            // if the score is the same, sort by updated_at
            let aScore = a.score;
            let bScore = b.score;
            // working around a bug where negative score was assigned
            // for an empty negative prompt.
            if (a.phrases.join("").trim() !== "") {
                aScore = aScore - a.negative_score;
            }
            if (b.phrases.join("").trim() !== "") {
                bScore = bScore - b.negative_score;
            }
            if (aScore == bScore) {
                return b.updated_at - a.updated_at;
            }
            return bScore - aScore;
        }

        return b.updated_at - a.updated_at;
    };

    const onLoadMore = async () => {
        // get the minimum updated_at from images
        let minUpdatedAt = moment().valueOf();
        images.forEach((image) => {
            minUpdatedAt = Math.min(minUpdatedAt, image.updated_at);
        });
        // load images in descending order from updated_at
        const resp = await api.listImages(
            minUpdatedAt - 1,
            search,
            100,
            "desc"
        );
        if (resp.data.images && resp.data.images.length > 0) {
            // combine images with new images and sort by updated_at descending
            setImages((images) =>
                [...images, ...(resp.data.images || [])]
                    .filter((image) => !image.deleted_at)
                    .sort(sortImages)
            );
        } else {
            setHasMore(false);
        }
    };

    const onDelete = async (image: Image) => {
        try {
            await api.deleteImage(image.id);
        } catch (e) {
            console.error(e);
            setErr("Error deleting image");
        }
    };

    const onFork = async (image: Image) => {
        setParentImage(image);
        // setSelectedImage(null);
        history.push("/");
        window.scrollTo(0, 0);
    };

    const onEdit = async (image: Image) => {
        history.push(`/image-editor/${image.id}`);
    };

    const onThumbnailClicked = (image: Image) => {
        // setSelectedImage(image);
        if (bulkDeleteSelecting) {
            setBulkDeleteIds({
                ...bulkDeleteIds,
                [image.id]: !bulkDeleteIds[image.id],
            });
        } else {
            history.push(`/images/${image.id}`);
        }
    };

    const handleCancelFork = () => {
        setParentImage(null);
        window.scrollTo(0, 0);
    };

    const onConfirmBulkDelete = async () => {
        try {
            setBulkDeleting(true);
            // await api.deleteImages(Object.keys(bulkDeleteIds));
            const promises = Object.keys(bulkDeleteIds).map((id) => {
                return api.deleteImage(id);
            });
            await Promise.all(promises);
            setImages((images) => {
                return images.filter((image) => !bulkDeleteIds[image.id]);
            });
            setBulkDeleteIds({});
            setBulkDeleteSelecting(false);
        } catch (e) {
            console.error(e);
            setErr("Error deleting images");
        } finally {
            setBulkDeleting(false);
        }
    };

    const completedOrSavedImages = images.filter((image) => {
        return (
            !image.deleted_at &&
            (image.status === ImageStatusEnum.Completed ||
                image.status === ImageStatusEnum.Saved)
        );
    });

    const pendingOrProcessingImages = images.filter(
        (image) =>
            !image.deleted_at &&
            (image.status === ImageStatusEnum.Pending ||
                image.status === ImageStatusEnum.Processing)
    );

    const pendingImages = pendingOrProcessingImages.filter(
        (image) => image.status === ImageStatusEnum.Pending
    );

    const processingImages = pendingOrProcessingImages.filter(
        (image) => image.status === ImageStatusEnum.Processing
    );

    return (
        <>
            <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                Welcome to AiBrush
            </h1>

            <ImagePrompt
                assetsUrl={assetsUrl}
                creating={creating}
                onSubmit={onSubmit}
                onEdit={onEditNewImage}
                parent={parentImage}
                onCancel={() => handleCancelFork()}
            />
            <hr />

            <div className="homepage-images" style={{ marginTop: "48px" }}>
                <div style={{ textAlign: "left" }}>
                    <div
                        className="input-group"
                        style={{ marginBottom: "16px" }}
                    >
                        <input
                            style={{}}
                            value={searchDebounce}
                            type="search"
                            className="form-control image-search"
                            placeholder="Search..."
                            onChange={(e) => setSearchDebounce(e.target.value)}
                        />

                        <div
                            style={{
                                float: "right",
                            }}
                        >
                            {!bulkDeleteSelecting && (
                                <Dropdown>
                                    <Dropdown.Toggle variant="danger">
                                        <i className="fas fa-trash"></i>
                                    </Dropdown.Toggle>

                                    <Dropdown.Menu>
                                        <Dropdown.Item
                                            onClick={() =>
                                                setBulkDeleteSelecting(true)
                                            }
                                        >
                                            Bulk Delete
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                            onClick={() =>
                                                history.push("/deleted-images")
                                            }
                                        >
                                            View Deleted Images
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Dropdown>
                            )}
                            {bulkDeleteSelecting && (
                                <>
                                    <button
                                        className="btn btn-primary image-popup-button"
                                        onClick={() => {
                                            setBulkDeleteSelecting(false);
                                            setBulkDeleteIds({});
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        style={{ marginLeft: "8px" }}
                                        className="btn image-popup-delete-button"
                                        onClick={() => {
                                            onConfirmBulkDelete();
                                        }}
                                    >
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <InfiniteScroll
                    dataLength={images.length}
                    next={onLoadMore}
                    hasMore={hasMore}
                    loader={<><hr/><h4>Loading...</h4></>}
                >
                    {pendingOrProcessingImages.length > 0 && (
                        <PendingImagesThumbnail
                            pendingCount={pendingImages.length}
                            processingCount={processingImages.length}
                            onClick={() => {
                                setShowPendingImages(true);
                            }}
                        />
                    )}
                    {completedOrSavedImages.map((image) => (
                        <ImageThumbnail
                            key={image.id}
                            image={image}
                            assetsUrl={assetsUrl}
                            onClick={onThumbnailClicked}
                            bulkDelete={
                                bulkDeleteSelecting && bulkDeleteIds[image.id]
                            }
                        />
                    ))}
                </InfiniteScroll>
            </div>

            {selectedImage && (
                <ImagePopup
                    assetsUrl={assetsUrl}
                    image={selectedImage}
                    onClose={() => history.push("/")}
                    onDelete={(image) => {
                        onDelete(image);
                        setImages(images.filter((i) => i.id !== image.id));
                        history.push("/");
                    }}
                    onFork={(image) => {
                        onFork(image);
                        history.push("/");
                    }}
                    onEdit={(image) => {
                        onEdit(image);
                    }}
                    onUpscale={(image) => {
                        onUpscale(image);
                    }}
                    onNSFW={onNSFW}
                />
            )}
            <ScrollToTop />
            <BusyModal show={creating} title="Creating images">
                <p>Please wait while we create your image.</p>
            </BusyModal>
            <BusyModal show={bulkDeleting} title="Deleting images">
                <p>Please wait while we delete your images.</p>
            </BusyModal>
            <PendingImages
                images={pendingOrProcessingImages}
                onCancel={() => setShowPendingImages(false)}
                show={showPendingImages}
                onDeleteImage={(image) => {
                    onDelete(image);
                    setImages(images.filter((i) => i.id !== image.id));
                }}
            />
        </>
    );
};
