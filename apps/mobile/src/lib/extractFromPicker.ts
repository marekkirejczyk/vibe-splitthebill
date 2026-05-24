import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  computeResizeTarget,
  JPEG_QUALITY,
  type ExtractedReceipt,
} from "@splitbill/core";
import { apiBaseUrl } from "./apiBaseUrl";

export type PickerSource = "camera" | "library";

export class PickerCancelledError extends Error {
  constructor() {
    super("Picker cancelled");
    this.name = "PickerCancelledError";
  }
}

export class PermissionDeniedError extends Error {
  constructor(public source: PickerSource) {
    super(`${source} permission denied`);
    this.name = "PermissionDeniedError";
  }
}

// One-shot pipeline: native picker → expo-image-manipulator (resize +
// force-JPEG so HEIC assets become a MIME the server accepts) → multipart
// POST to /api/extract → typed receipt.
//
// Behaviour parity with apps/web/src/app/page.tsx's extract() — same resize
// heuristic, same empty-lines guard, same server-error pass-through. Mobile
// adds two error classes the host pattern-matches on: PickerCancelledError
// (silent return to Start) and PermissionDeniedError (native Alert with an
// Open-Settings deep link).
export async function extractFromPicker(
  source: PickerSource,
  options: { signal?: AbortSignal } = {},
): Promise<ExtractedReceipt> {
  const perm =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new PermissionDeniedError(source);

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          quality: 1,
          exif: false,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 1,
          exif: false,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
  if (result.canceled) throw new PickerCancelledError();
  const asset = result.assets[0];

  // Force-JPEG unconditionally — iOS picker can hand back HEIC, which is not
  // in the route's ALLOWED_TYPES. actions: [] is a valid no-op when no resize
  // is needed; the format/compress options still apply.
  const target = computeResizeTarget(
    asset.width,
    asset.height,
    asset.fileSize ?? 0,
  );
  const out = await ImageManipulator.manipulateAsync(
    asset.uri,
    target ? [{ resize: target }] : [],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  const form = new FormData();
  // React Native's FormData accepts a { uri, name, type } object literal for
  // file parts. The `as any` is unavoidable — the DOM lib's FormData.append
  // signature is stricter than RN's runtime accepts.
  form.append("image", {
    uri: out.uri,
    name: "receipt.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/api/extract`, {
      method: "POST",
      body: form,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // RN's fetch throws TypeError("Network request failed") when offline.
    throw new Error(
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  if (!res.ok) {
    const data = await res
      .json()
      .catch(() => ({ error: res.statusText }) as { error: string });
    throw new Error(data.error || `Server returned ${res.status}`);
  }
  const receipt = (await res.json()) as ExtractedReceipt;
  if (!receipt.lines || receipt.lines.length === 0) {
    throw new Error(
      "I couldn't read any items from that photo. Try a sharper one?",
    );
  }
  return receipt;
}
