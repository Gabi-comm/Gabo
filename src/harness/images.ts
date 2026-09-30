// Images pasted or dropped into a message, sent to Claude as image blocks (like a screenshot pasted in the CLI).

export interface ImageAttachment { mediaType: string; data: string }

export const MAX_IMAGES = 5;
/** Base64 characters (≈3.75 MB of image), under the API's per-image limit. */
export const MAX_IMAGE_B64 = 5_000_000;
const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Null when fine, otherwise a sentence for Gab. */
export function checkImages(images: unknown): string | null {
  if (images === undefined) return null;
  if (!Array.isArray(images)) return "Images must be a list.";
  if (images.length > MAX_IMAGES) return `Attach at most ${MAX_IMAGES} images per message.`;
  for (const img of images as Partial<ImageAttachment>[]) {
    if (!img || typeof img.mediaType !== "string" || !TYPES.has(img.mediaType)) return "Images must be PNG, JPEG, GIF or WebP.";
    if (typeof img.data !== "string" || img.data.length === 0) return "An image arrived empty.";
    if (img.data.length > MAX_IMAGE_B64) return "An image is too large (keep each under about 3.5 MB).";
    if (!BASE64.test(img.data)) return "An image wasn't valid base64.";
  }
  return null;
}

export type UserBlock =
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "text"; text: string };

export function userContent(text: string, images: ImageAttachment[]): UserBlock[] {
  return [
    ...images.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } })),
    { type: "text", text },
  ];
}
