import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FIX = join(process.cwd(), "tests", "fixtures");

// We need to control what the Anthropic SDK does without making real network
// calls. The route imports extractReceipt from "@/lib/parseReceipt"; mocking
// that module lets us drive every code path of route.ts deterministically.
const extractReceiptMock = vi.fn();
vi.mock("@/lib/parseReceipt", () => ({
  extractReceipt: (...args: unknown[]) => extractReceiptMock(...args),
}));

// Avoid actually instantiating the Anthropic client (it would noop without a
// key, but mocking removes any chance of accidental construction warnings).
vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropic {},
}));

// Import AFTER mocks are registered.
const { POST } = await import("./route");

async function fixtureFile(
  name: string,
  mime: string,
  overrideType?: string
): Promise<File> {
  const buf = await readFile(join(FIX, name));
  // Allow callers to lie about the type for the 415 test.
  return new File([buf], name, { type: overrideType ?? mime });
}

function postWithForm(form: FormData) {
  return POST(
    new Request("http://localhost/api/extract", { method: "POST", body: form })
  );
}

describe("POST /api/extract", () => {
  beforeEach(() => {
    extractReceiptMock.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-dummy");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("500 when ANTHROPIC_API_KEY is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const form = new FormData();
    form.append("image", await fixtureFile("tiny.png", "image/png"));
    const res = await postWithForm(form);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(extractReceiptMock).not.toHaveBeenCalled();
  });

  test("400 when no image field is uploaded", async () => {
    const form = new FormData();
    const res = await postWithForm(form);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No image uploaded");
  });

  test("400 when 'image' field is present but not a File", async () => {
    const form = new FormData();
    form.append("image", "not-a-file");
    const res = await postWithForm(form);
    expect(res.status).toBe(400);
  });

  test("415 when image has an unsupported MIME type", async () => {
    const form = new FormData();
    // The route checks the type the client sent; we lie about it.
    form.append(
      "image",
      await fixtureFile("not-an-image.txt", "text/plain", "text/plain")
    );
    const res = await postWithForm(form);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/text\/plain/);
  });

  test("415 for an image type we don't support (image/bmp)", async () => {
    const form = new FormData();
    form.append(
      "image",
      await fixtureFile("tiny.png", "image/png", "image/bmp")
    );
    const res = await postWithForm(form);
    expect(res.status).toBe(415);
  });

  test("413 when image exceeds the 8MB size cap", async () => {
    const form = new FormData();
    const oversized = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    form.append("image", oversized);
    const res = await postWithForm(form);
    expect(res.status).toBe(413);
  });

  test("200 returns the extracted receipt for a valid JPEG", async () => {
    extractReceiptMock.mockResolvedValueOnce({
      currency: "$",
      lines: [
        { name: "Margherita pizza", price: 14, category: "item" },
        { name: "Caesar salad", price: 11.5, category: "item" },
        { name: "Sales tax", price: 2.04, category: "tax" },
      ],
    });
    const form = new FormData();
    form.append("image", await fixtureFile("receipt.jpg", "image/jpeg"));
    const res = await postWithForm(form);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currency).toBe("$");
    expect(body.lines).toHaveLength(3);
    expect(extractReceiptMock).toHaveBeenCalledTimes(1);
    // The 3rd arg is the mime type passed to the SDK.
    expect(extractReceiptMock.mock.calls[0][2]).toBe("image/jpeg");
  });

  test("502 when extractReceipt throws (upstream / model failure)", async () => {
    extractReceiptMock.mockRejectedValueOnce(new Error("Anthropic 529: overloaded"));
    const form = new FormData();
    form.append("image", await fixtureFile("receipt.jpg", "image/jpeg"));
    const res = await postWithForm(form);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/overloaded|529/);
  });

  test("accepts all four supported image types", async () => {
    extractReceiptMock.mockResolvedValue({ currency: "$", lines: [] });
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ] as const) {
      const form = new FormData();
      form.append(
        "image",
        await fixtureFile("tiny.png", mime, mime)
      );
      const res = await postWithForm(form);
      expect(res.status, `mime=${mime}`).toBe(200);
    }
  });
});
