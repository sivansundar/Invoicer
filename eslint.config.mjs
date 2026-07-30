import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // These files render a user-uploaded brand logo that is stored (and
    // read back) as a base64 data URI, not a remote/static asset — there is
    // no origin for `next/image` to optimize against, and `next/image`'s
    // data-URI support still requires `unoptimized` with none of the usual
    // benefit (no CDN, no responsive `sizes`) for a ~36px inline thumbnail.
    // `invoice-preview.tsx` itself is now just a design dispatcher (see
    // `src/components/invoices/designs/`) — the two design implementations
    // that actually render the logo `<img>` are listed here instead.
    // Scoped to exactly these files rather than an inline `eslint-disable`,
    // which this repo doesn't use.
    files: [
      "src/components/brands/brand-form.tsx",
      "src/components/invoices/designs/modern-invoice-preview.tsx",
      "src/components/invoices/designs/classic-invoice-preview.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
