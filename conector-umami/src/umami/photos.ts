/**
 * Adding a photo to a recipe takes two calls, as in the Umami app:
 *  1. upload the image to Firebase Storage at recipes/<recipeId>/images/<id>;
 *  2. tell Umami about it with its AddRecipePhotos RPC (gRPC-web text content
 *     type), whose request message is { 1: recipeId, 2: storagePath }.
 * If step 2 is rejected, the uploaded file is deleted again.
 */
import { LIMITS, STORAGE_URL, UMAMI, webFetch } from "./config.js";
import { failure, UmamiError } from "./errors.js";
import type { Session } from "./session.js";
import { newId } from "./store.js";

type Mime = "image/jpeg" | "image/png" | "image/webp";

export class Photos {
  private readonly http: typeof fetch;

  constructor(
    private readonly session: Session,
    http: typeof fetch = webFetch,
  ) {
    this.http = (input, init) => http(input, init);
  }

  async add(recipeId: string, source: { imageUrl?: string; imageBase64?: string }) {
    const bytes = await this.load(source);
    const mimeType = sniff(bytes);
    const path = `recipes/${recipeId}/images/${newId()}`;
    await this.upload(path, bytes, mimeType);
    try {
      await this.register(recipeId, path);
    } catch (error) {
      await this.discard(path);
      throw error;
    }
    return { path, mimeType, sizeBytes: bytes.byteLength };
  }

  private async load({ imageUrl, imageBase64 }: { imageUrl?: string; imageBase64?: string }): Promise<Uint8Array> {
    if (!imageUrl === !imageBase64) throw new UmamiError("Give exactly one of imageUrl or imageBase64");
    if (imageBase64) return fromBase64(imageBase64);

    let url: URL;
    try {
      url = new URL(imageUrl!);
    } catch {
      throw new UmamiError("imageUrl is not a valid URL");
    }
    if (url.protocol !== "https:") throw new UmamiError("imageUrl must start with https://");
    const response = await this.http(url, { headers: { accept: "image/jpeg, image/png, image/webp" } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new UmamiError(`Could not download the image (HTTP ${response.status})`, response.status);
    }
    if (response.url && !response.url.startsWith("https:")) {
      await response.body?.cancel();
      throw new UmamiError("The image URL redirected to a non-HTTPS address");
    }
    return readCapped(response);
  }

  private async upload(path: string, bytes: Uint8Array, mimeType: Mime): Promise<void> {
    const boundary = "----umami-mcp-" + newId(16);
    const head = new TextEncoder().encode(
      `--${boundary}\r\ncontent-type: application/json; charset=utf-8\r\n\r\n` +
        JSON.stringify({ name: path, contentType: mimeType }) +
        `\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const body = join(head, bytes, tail);
    const url = `${STORAGE_URL}?name=${encodeURIComponent(path)}`;

    const send = async (force: boolean) =>
      this.http(url, {
        method: "POST",
        headers: {
          authorization: `Firebase ${await this.session.idToken(force)}`,
          "content-type": `multipart/related; boundary=${boundary}`,
          "x-goog-upload-protocol": "multipart",
        },
        body,
      });
    let response = await send(false);
    if (response.status === 401) {
      await response.body?.cancel();
      response = await send(true);
    }
    if (!response.ok) throw await failure("Photo upload", response);
    await response.body?.cancel();
  }

  private async register(recipeId: string, path: string): Promise<void> {
    // Umami's endpoint takes the bare protobuf message, base64-encoded.
    const message = join(protoString(1, recipeId), protoString(2, path));

    const send = async (force: boolean) =>
      this.http(UMAMI.addPhotosRpc, {
        method: "POST",
        headers: {
          "content-type": "application/grpc-web-text",
          "id-token": await this.session.idToken(force),
        },
        body: toBase64(message),
      });
    let response = await send(false);
    if (response.status === 401 || response.headers.get("grpc-status") === "16") {
      await response.body?.cancel();
      response = await send(true);
    }
    const raw = response.ok ? await response.text().catch(() => "") : "";
    const status = response.headers.get("grpc-status") ?? trailerStatus(raw);
    if (!response.ok || (status && status !== "0")) {
      const detail = response.headers.get("grpc-message");
      throw new UmamiError(
        `Umami did not accept the photo (${detail ? safeDecode(detail) : `status ${status ?? response.status}`})`,
        response.status,
      );
    }
  }

  private async discard(path: string): Promise<void> {
    try {
      const response = await this.http(`${STORAGE_URL}/${encodeURIComponent(path)}`, {
        method: "DELETE",
        headers: { authorization: `Firebase ${await this.session.idToken()}` },
      });
      await response.body?.cancel();
    } catch {
      // Best effort: a stray file in storage is harmless.
    }
  }
}

/** Protobuf length-delimited string field. */
function protoString(field: number, value: string): Uint8Array {
  const data = new TextEncoder().encode(value);
  const length: number[] = [];
  let n = data.length;
  do {
    length.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0));
    n >>>= 7;
  } while (n > 0);
  return join(Uint8Array.of((field << 3) | 2), Uint8Array.from(length), data);
}

/** gRPC-web text responses may carry the status in a base64 trailer frame. */
function trailerStatus(base64: string): string | undefined {
  try {
    const text = atob(base64.replace(/\s/g, ""));
    return /grpc-status:\s*(\d+)/.exec(text)?.[1];
  } catch {
    return undefined;
  }
}

function sniff(b: Uint8Array): Mime {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const tag = (from: number) => String.fromCharCode(...b.slice(from, from + 4));
  if (b.length >= 12 && tag(0) === "RIFF" && tag(8) === "WEBP") return "image/webp";
  throw new UmamiError("The image must be JPEG, PNG or WebP");
}

function fromBase64(value: string): Uint8Array {
  const data = value.replace(/^data:image\/[a-z]+;base64,/i, "").replace(/\s/g, "");
  if (data.length > Math.ceil(LIMITS.photoBytes / 3) * 4) throw new UmamiError("The image is larger than 10 MB");
  try {
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    throw new UmamiError("imageBase64 is not valid base64");
  }
}

async function readCapped(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length") ?? 0) > LIMITS.photoBytes) {
    await response.body?.cancel();
    throw new UmamiError("The image is larger than 10 MB");
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > LIMITS.photoBytes) throw new UmamiError("The image is larger than 10 MB");
  return buffer;
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
