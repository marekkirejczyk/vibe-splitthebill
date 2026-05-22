const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export async function resizeImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  const longEdge = Math.max(img.width, img.height);
  if (longEdge <= MAX_EDGE && file.size < 1.5 * 1024 * 1024) {
    return file;
  }
  const scale = Math.min(1, MAX_EDGE / longEdge);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

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
