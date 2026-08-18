import { TOKENS, FONT_LINK, FONT, FONTS } from './lib.mjs';

/**
 * Wraps a screen body in a Design Component document.
 * `--blue` is the one cross-cutting lever exposed as a tweak; every other
 * colour is an inline token so it paints while the artboard streams in.
 */
export function doc({ body, width, height, root = '', props = {}, allFonts = false }) {
  const dataProps = JSON.stringify({
    accent: {
      editor: 'color',
      default: 'oklch(0.52 0.16 258)',
      options: ['#2f5fd0', '#1a7f64', '#b4530f', '#5b41c8'],
    },
    $preview: { width, height },
    ...props,
  })
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${allFonts ? Object.values(FONTS).map((f) => `<link rel="stylesheet" href="${f.href}">`).join('\n  ') : FONT_LINK}
  <style>
    body { margin: 0; }
    a { color: oklch(0.52 0.008 70); text-decoration: none; }
    a:hover { color: oklch(0.19 0.004 70); }
    .iv, .iv * { box-sizing: border-box; }
    .iv { -webkit-font-smoothing: antialiased; }
  </style>
</helmet>

<div class="iv" style="--blue: {{accent}};${TOKENS}
    width: ${width}px; ${height ? `height: ${height}px;` : ''} display: flex; overflow: hidden;
    background: var(--canvas); color: var(--ink);
    --font-sans: ${FONT.sans};
    --font-display: ${FONT.display};
    --font-mono: ${FONT.mono};
    --display-weight: ${FONT.displayWeight};
    --display-tracking: ${FONT.displayTracking};
    font-family: var(--font-sans);
    font-size: 14px; letter-spacing: -0.005em; ${root}">
${body}
</div>
</x-dc>
<script data-dc-script data-props='${dataProps}'>
class Component extends DCLogic {
  renderVals() {
    return { accent: this.props.accent ?? 'oklch(0.52 0.16 258)' };
  }
}
</script>
</body>
</html>
`;
}
