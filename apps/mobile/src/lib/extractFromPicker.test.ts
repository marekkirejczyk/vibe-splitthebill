import {
  JPEG_QUALITY,
  MAX_EDGE,
  type ExtractedReceipt,
} from "@splitbill/core";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  extractFromPicker,
  PermissionDeniedError,
  PickerCancelledError,
} from "./extractFromPicker";

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "https://example.test" } } },
}));

const mockedPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mockedManipulator = ImageManipulator as jest.Mocked<typeof ImageManipulator>;

const fetchMock = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

function makeReceipt(): ExtractedReceipt {
  return {
    currency: "$",
    lines: [{ name: "Coffee", price: 4.5, category: "item" }],
    taxBehavior: "exclusive",
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  mockedPicker.requestCameraPermissionsAsync.mockReset();
  mockedPicker.requestMediaLibraryPermissionsAsync.mockReset();
  mockedPicker.launchCameraAsync.mockReset();
  mockedPicker.launchImageLibraryAsync.mockReset();
  mockedManipulator.manipulateAsync.mockReset();
});

test("camera permission denied → PermissionDeniedError; picker not invoked", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: false,
    canAskAgain: true,
    expires: "never",
    status: "denied",
  } as unknown as ImagePicker.CameraPermissionResponse);

  await expect(extractFromPicker("camera")).rejects.toMatchObject({
    name: "PermissionDeniedError",
    source: "camera",
  } as PermissionDeniedError);
  expect(mockedPicker.launchCameraAsync).not.toHaveBeenCalled();
  expect(mockedManipulator.manipulateAsync).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("library permission denied → PermissionDeniedError(source=library)", async () => {
  mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
    granted: false,
    canAskAgain: true,
    expires: "never",
    status: "denied",
  } as unknown as ImagePicker.MediaLibraryPermissionResponse);

  await expect(extractFromPicker("library")).rejects.toMatchObject({
    name: "PermissionDeniedError",
    source: "library",
  });
  expect(mockedPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
});

test("user cancels the camera picker → PickerCancelledError", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
    canAskAgain: true,
    expires: "never",
    status: "granted",
  } as unknown as ImagePicker.CameraPermissionResponse);
  mockedPicker.launchCameraAsync.mockResolvedValueOnce({
    canceled: true,
  } as ImagePicker.ImagePickerResult);

  await expect(extractFromPicker("camera")).rejects.toBeInstanceOf(
    PickerCancelledError,
  );
  expect(mockedManipulator.manipulateAsync).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("happy path: large image → resize + JPEG re-encode + 200 receipt", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
    canAskAgain: true,
    expires: "never",
    status: "granted",
  } as unknown as ImagePicker.CameraPermissionResponse);
  mockedPicker.launchCameraAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        uri: "file:///tmp/raw.heic",
        width: 2400,
        height: 1800,
        fileSize: 3_500_000,
      },
    ],
  } as unknown as ImagePicker.ImagePickerResult);
  mockedManipulator.manipulateAsync.mockResolvedValueOnce({
    uri: "file:///tmp/out.jpg",
    width: MAX_EDGE,
    height: 1200,
  } as ImageManipulator.ImageResult);
  const receipt = makeReceipt();
  fetchMock.mockResolvedValueOnce(jsonResponse(200, receipt));

  await expect(extractFromPicker("camera")).resolves.toEqual(receipt);

  // computeResizeTarget(2400, 1800, 3_500_000) should drop the long edge to
  // MAX_EDGE; the actions array passed to manipulateAsync must reflect that.
  const [uri, actions, options] = mockedManipulator.manipulateAsync.mock.calls[0];
  expect(uri).toBe("file:///tmp/raw.heic");
  expect(actions).toEqual([
    { resize: { width: MAX_EDGE, height: 1200 } },
  ]);
  expect(options).toMatchObject({ compress: JPEG_QUALITY, format: "jpeg" });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://example.test/api/extract");
  expect(init.method).toBe("POST");
  expect(init.body).toBeInstanceOf(FormData);
});

test("small image → no resize, still force-JPEG (actions: [])", async () => {
  mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
    granted: true,
    canAskAgain: true,
    expires: "never",
    status: "granted",
  } as unknown as ImagePicker.MediaLibraryPermissionResponse);
  mockedPicker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        uri: "file:///tmp/small.jpg",
        width: 800,
        height: 600,
        fileSize: 300_000,
      },
    ],
  } as unknown as ImagePicker.ImagePickerResult);
  mockedManipulator.manipulateAsync.mockResolvedValueOnce({
    uri: "file:///tmp/out.jpg",
    width: 800,
    height: 600,
  } as ImageManipulator.ImageResult);
  fetchMock.mockResolvedValueOnce(jsonResponse(200, makeReceipt()));

  await extractFromPicker("library");

  const [, actions, options] = mockedManipulator.manipulateAsync.mock.calls[0];
  expect(actions).toEqual([]);
  expect(options).toMatchObject({ compress: JPEG_QUALITY, format: "jpeg" });
});

test("server returns 502 with error JSON → throws with server message", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
  } as unknown as ImagePicker.CameraPermissionResponse);
  mockedPicker.launchCameraAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { uri: "file:///tmp/x.jpg", width: 100, height: 100, fileSize: 1000 },
    ],
  } as unknown as ImagePicker.ImagePickerResult);
  mockedManipulator.manipulateAsync.mockResolvedValueOnce({
    uri: "file:///tmp/out.jpg",
    width: 100,
    height: 100,
  } as ImageManipulator.ImageResult);
  fetchMock.mockResolvedValueOnce(
    jsonResponse(502, { error: "Anthropic 529: overloaded" }),
  );

  await expect(extractFromPicker("camera")).rejects.toThrow(
    "Anthropic 529: overloaded",
  );
});

test("server returns 500 with no JSON → falls back to statusText", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
  } as unknown as ImagePicker.CameraPermissionResponse);
  mockedPicker.launchCameraAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { uri: "file:///tmp/x.jpg", width: 100, height: 100, fileSize: 1000 },
    ],
  } as unknown as ImagePicker.ImagePickerResult);
  mockedManipulator.manipulateAsync.mockResolvedValueOnce({
    uri: "file:///tmp/out.jpg",
    width: 100,
    height: 100,
  } as ImageManipulator.ImageResult);
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    statusText: "Status 500",
    json: async () => {
      throw new Error("not json");
    },
  } as unknown as Response);

  await expect(extractFromPicker("camera")).rejects.toThrow("Status 500");
});

test("server returns 200 but lines empty → friendly error", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
  } as unknown as ImagePicker.CameraPermissionResponse);
  mockedPicker.launchCameraAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { uri: "file:///tmp/x.jpg", width: 100, height: 100, fileSize: 1000 },
    ],
  } as unknown as ImagePicker.ImagePickerResult);
  mockedManipulator.manipulateAsync.mockResolvedValueOnce({
    uri: "file:///tmp/out.jpg",
    width: 100,
    height: 100,
  } as ImageManipulator.ImageResult);
  fetchMock.mockResolvedValueOnce(
    jsonResponse(200, { currency: "$", lines: [] }),
  );

  await expect(extractFromPicker("camera")).rejects.toThrow(
    /couldn't read any items/i,
  );
});

test("fetch throws TypeError('Network request failed') → friendly offline error", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
  } as unknown as ImagePicker.CameraPermissionResponse);
  mockedPicker.launchCameraAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { uri: "file:///tmp/x.jpg", width: 100, height: 100, fileSize: 1000 },
    ],
  } as unknown as ImagePicker.ImagePickerResult);
  mockedManipulator.manipulateAsync.mockResolvedValueOnce({
    uri: "file:///tmp/out.jpg",
    width: 100,
    height: 100,
  } as ImageManipulator.ImageResult);
  fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

  await expect(extractFromPicker("camera")).rejects.toThrow(
    /couldn't reach the server/i,
  );
});

test("AbortError from fetch propagates verbatim so the host can detect cancel", async () => {
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
  } as unknown as ImagePicker.CameraPermissionResponse);
  mockedPicker.launchCameraAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { uri: "file:///tmp/x.jpg", width: 100, height: 100, fileSize: 1000 },
    ],
  } as unknown as ImagePicker.ImagePickerResult);
  mockedManipulator.manipulateAsync.mockResolvedValueOnce({
    uri: "file:///tmp/out.jpg",
    width: 100,
    height: 100,
  } as ImageManipulator.ImageResult);
  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  fetchMock.mockRejectedValueOnce(abortErr);

  await expect(extractFromPicker("camera")).rejects.toMatchObject({
    name: "AbortError",
  });
});
