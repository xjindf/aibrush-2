// Workspace react component
// Display the workspace images
// use bootstrap

import React, { FC, useState, useEffect } from "react";
import { Link, useHistory } from "react-router-dom"
import { ImageThumbnail } from "../components/ImageThumbnail"
import { Workspace, loadWorkspace, saveWorkspace } from "../lib/workspace"
import { AIBrushApi, Image, ImageStatusEnum, UpdateImageInputStatusEnum } from "../client/api";
import { ImagePopup } from "../components/ImagePopup";

interface WorkspacePageProps {
    apiUrl: string;
    api: AIBrushApi;
}

export const WorkspacePage: FC<WorkspacePageProps> = ({ apiUrl, api }) => {
    const [workspace, setWorkspace] = useState<Workspace>({ images: [] })
    const [err, setErr] = useState("")
    const [selectedImage, setSelectedImage] = useState<Image>()

    const history = useHistory();

    const [showStatuses, setShowStatuses] = useState({
        [ImageStatusEnum.Pending]: true,
        [ImageStatusEnum.Processing]: true,
        [ImageStatusEnum.Completed]: true,
        [ImageStatusEnum.Saved]: true,
    })

    const onChangeShowStatuses = (status: ImageStatusEnum, value: boolean) => {
        setShowStatuses({
            ...showStatuses,
            [status]: value
        })
    }

    const onSaveImage = async (image: Image) => {
        // patch image with status=saved
        try {
            const resp = await api.updateImage(image.id as string, { status: UpdateImageInputStatusEnum.Saved })
            const updatedImage = resp.data;
            const updatedWorkspace = {
                images: workspace.images.map(i => i.id === updatedImage.id ? updatedImage : i)
            }
            setWorkspace(updatedWorkspace)
            saveWorkspace(updatedWorkspace)
        } catch (err) {
            console.error(err)
            setErr("Could not save image")
        }
    }

    useEffect(() => {
        let workspace = loadWorkspace()
        setWorkspace(workspace)
        let lock = false;

        const timerHandle = setInterval(async () => {
            if (lock) {
                return;
            }
            try {
                lock = true;
                const images: Array<Image> = []
                for (let image of workspace.images) {
                    try {
                        const resp = await api.getImage(image.id)
                        const updatedImage = resp.data;
                        images.push(updatedImage)
                        if (selectedImage && updatedImage.id == selectedImage.id) {
                            setSelectedImage(updatedImage)
                        }
                    } catch (err) {
                        console.error(err)
                    }
                }
                
                workspace = {
                    images: images
                }
                setWorkspace(workspace)
                saveWorkspace(workspace)
            } finally {
                lock = false;
            }
        }, 5000)
        return () => {
            clearInterval(timerHandle)
        }
    }, [workspace && workspace.images.length])

    const onDeleteImage = async (image: Image) => {
        // clear error
        setErr("")
        // attempt to delete image
        try {
            const updatedWorkspace = {
                ...workspace,
                images: workspace.images.filter(i => i.id !== image.id)
            }
            setWorkspace(updatedWorkspace)
            saveWorkspace(updatedWorkspace)
            await api.deleteImage(image.id as string)
        } catch (err) {
            console.error(err)
            setErr("Could not delete image")
        }
    }

    const onForkImage = async (image: Image) => {
        // navigate to /create-image with ?parent=image.id
        history.push(`/create-image?parent=${image.id}`)
    }

    const onClickImage = (image: Image) => {
        setSelectedImage(image)
    }

    // show the images in the workspace
    return (
        <div className="container">
            <div className="row">
                <div className="col-12">
                    <h1>Workspace</h1>
                </div>
            </div>
            {/* display error message if one is set */}
            {err && <div className="row">
                <div className="col-12">
                    <div className="alert alert-danger" role="alert">
                        {err}
                    </div>
                </div>
            </div>}
            <hr />
            {/* Link to navigate to CreateImage */}
            <div className="row">
                <div className="col-12">
                    <Link to="/create-image" className="btn btn-primary">
                        <i className="fas fa-plus"></i>&nbsp;
                        Create Image
                    </Link>
                </div>
            </div>
            <hr />
            {/* checkboxes to toggle show pending, processing, completed and saved */}
            <div className="row">
                <div className="col-12">
                    <div className="form-check">
                        <input className="form-check-input" type="checkbox" checked={showStatuses[ImageStatusEnum.Pending]} onChange={(e) => onChangeShowStatuses(ImageStatusEnum.Pending, e.target.checked)} />
                        <label className="form-check-label">
                            Pending
                        </label>
                    </div>
                    <div className="form-check">
                        <input className="form-check-input" type="checkbox" checked={showStatuses[ImageStatusEnum.Processing]} onChange={(e) => onChangeShowStatuses(ImageStatusEnum.Processing, e.target.checked)} />
                        <label className="form-check-label">
                            Processing
                        </label>
                    </div>
                    <div className="form-check">
                        <input className="form-check-input" type="checkbox" checked={showStatuses[ImageStatusEnum.Completed]} onChange={(e) => onChangeShowStatuses(ImageStatusEnum.Completed, e.target.checked)} />
                        <label className="form-check-label">
                            Completed
                        </label>
                    </div>
                    <div className="form-check">
                        <input className="form-check-input" type="checkbox" checked={showStatuses[ImageStatusEnum.Saved]} onChange={(e) => onChangeShowStatuses(ImageStatusEnum.Saved, e.target.checked)} />
                        <label className="form-check-label">
                            Saved
                        </label>
                    </div>
                </div>
            </div>

            <hr />
            {/*  spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer"></div>
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <div className="row">
                        {workspace.images.filter(image => showStatuses[image.status as ImageStatusEnum]).map(image => (
                            <ImageThumbnail onFork={onForkImage} onSave={onSaveImage} key={`image-thumbnail-${image.id}`} apiUrl={apiUrl} image={image} onClick={onClickImage} onDelete={onDeleteImage} />
                        ))}
                    </div>
                </div>
            </div>
            {/* show ImagePopup if selectedImage is set */}
            {selectedImage && <ImagePopup apiUrl={apiUrl} image={selectedImage as Image} onClose={() => setSelectedImage(undefined)} />}
        </div>
    )
}