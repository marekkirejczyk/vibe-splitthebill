import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { extractReceipt } from "@splitbill/core/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Gate the endpoint once API_SHARED_SECRET is configured server-side. Until
// then it stays open (local dev + any caller that predates the secret). When
// active, same-origin browser requests (the web app) are admitted by Origin —
// so no secret leaks into the public web bundle — and every other caller
// (the mobile binary, curl) must present a matching x-splitbill-key.
function isAuthorized(req: Request): boolean {
  const secret = process.env.API_SHARED_SECRET;
  if (!secret) return true;
  const allowedOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (allowedOrigin && req.headers.get("origin") === allowedOrigin) return true;
  const key = req.headers.get("x-splitbill-key") ?? "";
  return safeEqual(key, secret);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server missing ANTHROPIC_API_KEY" },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type}` },
      { status: 415 }
    );
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const client = new Anthropic({ apiKey });
    const receipt = await extractReceipt(
      client,
      base64,
      file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif"
    );
    return NextResponse.json(receipt);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
