import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Makes the Cloudflare bindings in wrangler.jsonc available under `next dev`.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // Turbopack's loader for the Prisma client's .wasm engine matches every
  // .wasm file in the project, which drags build-time tooling (the Prisma CLI,
  // its bundled Postgres, the local Workers runtime) into the Worker and takes
  // it past Cloudflare's size limit. None of it runs in production.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/prisma/**",
      "node_modules/@prisma/engines/**",
      "node_modules/@prisma/studio-core/**",
      "node_modules/@prisma/dev/**",
      "node_modules/@electric-sql/**",
      "node_modules/workerd/**",
      "node_modules/@cloudflare/workerd-*/**",
      "node_modules/wrangler/**",
      "node_modules/miniflare/**",
      "node_modules/@opennextjs/**",
      "node_modules/typescript/**",
      "node_modules/@img/**",
      "node_modules/sharp/**",
    ],
  },
};

export default nextConfig;
