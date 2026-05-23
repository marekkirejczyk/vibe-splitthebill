import { computeResizeTarget, JPEG_QUALITY } from "@splitbill/core";

export async function resizeImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const target = computeResizeTarget(img.width, img.height, file.size);
  if (!target) return file;

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, target.width, target.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Resize failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}
