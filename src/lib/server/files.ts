import { AwsClient } from "aws4fetch";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

let signer: AwsClient | undefined;

/** Signed request to one object in the private R2 bucket, over its S3-compatible API. */
function request(key: string, init: RequestInit): Promise<Response> {
  signer ??= new AwsClient({
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
  const path = key.split("/").map(encodeURIComponent).join("/");
  const url = `https://${required("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com/${required("R2_BUCKET")}/${path}`;
  return signer.fetch(url, init);
}

/**
 * Uploaded invoices. The bucket is never public: files reach a browser only
 * through /api/expenses/[id]/file, after a permission check.
 */
export const files = {
  async put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
    const res = await request(key, { method: "PUT", body: bytes, headers: { "content-type": contentType } });
    if (!res.ok) throw new Error(`Storing the file failed (${res.status})`);
  },
  /** The object's response, or null if it doesn't exist. */
  async get(key: string): Promise<Response | null> {
    const res = await request(key, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Fetching the file failed (${res.status})`);
    return res;
  },
  async delete(key: string): Promise<void> {
    const res = await request(key, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Deleting the file failed (${res.status})`);
  },
};
