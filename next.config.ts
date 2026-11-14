import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Makes the Cloudflare bindings in wrangler.jsonc available under `next dev`.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {};

export default nextConfig;
