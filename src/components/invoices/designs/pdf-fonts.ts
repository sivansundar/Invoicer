import { Font } from "@react-pdf/renderer";

/**
 * Font registration shared by every PDF design. `Font.register` is
 * idempotent per family (re-registering just overwrites the same sources),
 * but the URLs/paths themselves must only ever be written in one place —
 * two designs quietly drifting on font source is exactly the kind of
 * divergence this module exists to prevent. Imported for its side effect
 * only: `import "./pdf-fonts"` at the top of each design's PDF module.
 */
Font.register({
  family: "JetBrains Mono",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@2.304/fonts/ttf/JetBrainsMono-Regular.ttf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@2.304/fonts/ttf/JetBrainsMono-Bold.ttf",
      fontWeight: 700,
    },
  ],
});

// Noto Sans stands in for the app's Instrument Sans (a next/font/google face with
// no static file this renderer can load), and also supplies the ₹ glyph
// that JetBrains Mono lacks — currency symbols are always wrapped in it
// explicitly at each call site that needs it.
Font.register({
  family: "Noto Sans",
  fonts: [
    { src: "/fonts/NotoSans-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSans-Bold.ttf", fontWeight: 700 },
  ],
});
