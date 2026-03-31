/** Drag payload from the media gallery to the timeline (JSON in DataTransfer). */
export const MEDIA_GALLERY_DRAG_MIME = 'application/x-mve-asset';

export const setMediaGalleryDragData = (dataTransfer: DataTransfer, assetId: string) => {
  dataTransfer.setData(MEDIA_GALLERY_DRAG_MIME, JSON.stringify({ assetId }));
  dataTransfer.effectAllowed = 'copy';
};

export const parseMediaGalleryDragPayload = (dataTransfer: DataTransfer): { assetId: string } | null => {
  const raw = dataTransfer.getData(MEDIA_GALLERY_DRAG_MIME);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { assetId?: string };
    if (typeof parsed.assetId !== 'string' || !parsed.assetId) {
      return null;
    }

    return { assetId: parsed.assetId };
  } catch {
    return null;
  }
};
