import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../config.js";
import { v4 as uuidv4 } from "uuid";

let s3Client = null;

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
  });
  return s3Client;
}

/**
 * @returns {string|null} Public URL of the uploaded object, or null if R2 not configured or upload failed.
 */
export async function uploadAvatarFromUrl(imageUrl, userId) {
  const client = getClient();
  const { bucket, publicUrl } = config.r2;
  if (!client || !publicUrl) return null;

  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return `${publicUrl}/${key}`;
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
  const { bucket, publicUrl } = config.r2;
  if (!client || !publicUrl) return null;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1].trim();
  const base64 = match[2];
  const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length > 5 * 1024 * 1024) return null; // 5MB max

  try {
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return `${publicUrl}/${key}`;
  } catch (e) {
    console.error("[r2] uploadAvatarFromDataUrl", e);
    return null;
  }
}

export function isR2Configured() {
  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = config.r2;
  return !!(accountId && accessKeyId && secretAccessKey && bucket && publicUrl);
}
