export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;
export const RESIZE_SIZE_THRESHOLD = 1.5 * 1024 * 1024;

export type ResizeTarget = { width: number; height: number };

export function computeResizeTarget(
  width: number,
  height: number,
  sizeBytes: number,
  maxEdge = MAX_EDGE,
  sizeThreshold = RESIZE_SIZE_THRESHOLD
): ResizeTarget | null {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge && sizeBytes < sizeThreshold) return null;
  const scale = Math.min(1, maxEdge / longEdge);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
