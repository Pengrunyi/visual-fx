/** Local portraits and pet photos. Object URLs never leave the page. */
export const MAX_LOCAL_PHOTOS = 6;

export const FRAME_ASPECT = 1.02 / 1.26;

export function selectLocalImages<T extends { type: string }>(files: readonly T[], max = MAX_LOCAL_PHOTOS): T[] {
  return files.filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, max));
}

export interface FrameCrop {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

/** Center-crop a photo into the portrait frame without editing its pixels. */
export function frameCover(imageWidth: number, imageHeight: number, aspect = FRAME_ASPECT): FrameCrop {
  const imageAspect = imageHeight > 0 ? imageWidth / imageHeight : aspect;
  if (imageAspect > aspect) {
    const repeatX = aspect / imageAspect;
    return { repeatX, repeatY: 1, offsetX: (1 - repeatX) / 2, offsetY: 0 };
  }
  const repeatY = imageAspect / Math.max(aspect, 1e-4);
  return { repeatX: 1, repeatY, offsetX: 0, offsetY: (1 - repeatY) / 2 };
}
