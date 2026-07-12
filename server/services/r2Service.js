import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../config.js";
import { v4 as uuidv4 } from "uuid";

let s3Client = null;
let warnedBadPublicUrl = false;

function getClient() {
  if (s3Client) return s3Client;
  const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // Required for R2: path-style avoids virtual-hosted bucket DNS issues
    forcePathStyle: true,
  });
  return s3Client;
}

/**
 * True when R2_PUBLIC_URL is the S3 API host (not browser-accessible).
 * Public access must use an r2.dev URL or a custom domain.
 */
export function isR2ApiEndpointUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".r2.cloudflarestorage.com");
  } catch {
    return false;
  }
}

/**
 * Build a publicly loadable object URL, or null if public access isn't configured correctly.
 */
function buildPublicObjectUrl(key) {
  const { publicUrl } = config.r2;
  if (!publicUrl) return null;

  const base = publicUrl.replace(/\/$/, "");
  if (isR2ApiEndpointUrl(base)) {
    if (!warnedBadPublicUrl) {
      warnedBadPublicUrl = true;
      console.warn(
        "[r2] R2_PUBLIC_URL is the S3 API endpoint (*.r2.cloudflarestorage.com). " +
          "Browsers cannot load objects from it (InvalidArgument). " +
          "Set R2_PUBLIC_URL to your bucket's public r2.dev URL (e.g. https://pub-xxxxx.r2.dev) " +
          "or a custom domain connected to the bucket."
      );
    }
    return null;
  }
  return `${base}/${key}`;
}

/**
 * @returns {string|null} Public URL of the uploaded object, or null if R2 not configured or upload failed.
 */
export async function uploadAvatarFromUrl(imageUrl, userId) {
  const client = getClient();
  if (!client) return null;
  // Validate public URL before uploading so we don't store unusable links
  if (!buildPublicObjectUrl("avatars/_probe")) return null;

  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "RoboticelaToDo/1.0" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;
    const { bucket } = config.r2;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return buildPublicObjectUrl(key);
  } catch (e) {
    console.error("[r2] uploadAvatarFromUrl", e);
    return null;
  }
}

/**
 * Upload avatar from a data URL (e.g. from frontend file upload).
 * @param {string} dataUrl - data:image/png;base64,... or similar
 * @param {string} userId
 * @returns {string|null} Public URL or null.
 */
export async function uploadAvatarFromDataUrl(dataUrl, userId) {
  const client = getClient();
  if (!client) return null;
  if (!buildPublicObjectUrl("avatars/_probe")) return null;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1].trim();
  const base64 = match[2];
  const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length > 5 * 1024 * 1024) return null; // 5MB max

  try {
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;
    const { bucket } = config.r2;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return buildPublicObjectUrl(key);
  } catch (e) {
    console.error("[r2] uploadAvatarFromDataUrl", e);
    return null;
  }
}

/**
 * Delete an avatar object from R2 by its public URL (only if it's our R2 bucket).
 * No-op if R2 not configured or URL is not from our publicUrl. Does not throw.
 */
export async function deleteAvatarByUrl(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== "string") return;
  const client = getClient();
  const { bucket, publicUrl } = config.r2;
  if (!client || !bucket || !publicUrl) return;
  // Also allow deleting objects that were mistakenly saved with the API endpoint URL
  if (isR2ApiEndpointUrl(avatarUrl)) {
    try {
      const u = new URL(avatarUrl);
      // path may be /avatars/... or /bucket/avatars/...
      const parts = u.pathname.replace(/^\//, "").split("/");
      const key = parts[0] === bucket ? parts.slice(1).join("/") : parts.join("/");
      if (key.startsWith("avatars/")) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
    } catch (e) {
      console.warn("[r2] deleteAvatarByUrl (api-endpoint)", e?.message || e);
    }
    return;
  }
  const base = publicUrl.replace(/\/$/, "");
  if (!avatarUrl.startsWith(base + "/")) return;
  const key = avatarUrl.slice(base.length + 1);
  if (!key.startsWith("avatars/")) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn("[r2] deleteAvatarByUrl", key, e?.message || e);
  }
}

export function isR2Configured() {
  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = config.r2;
  return !!(
    accountId &&
    accessKeyId &&
    secretAccessKey &&
    bucket &&
    publicUrl &&
    !isR2ApiEndpointUrl(publicUrl)
  );
}
