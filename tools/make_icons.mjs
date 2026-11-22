// Generate the app icons from stroke data (no font dependency):
//   node tools/make_icons.mjs
// Writes app/public/icons/icon.svg and PNG renditions (192, 512, maskable 512).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'app/public/icons');
mkdirSync(out, { recursive: true });

const CHAR = '汉';
const strokes = JSON.parse(readFileSync(join(root, 'app/node_modules/hanzi-writer-data', `${CHAR}.json`), 'utf8')).strokes;

// Stroke paths use a 1024 box with the y axis pointing up (baseline at 900).
function svg({ pad, radius }) {
  const scale = (1024 - 2 * pad) / 1024;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="${radius}" fill="#a4262c"/>
  <g transform="translate(${pad} ${pad}) scale(${scale}) scale(1 -1) translate(0 -900)" fill="#fff7ec">
    ${strokes.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
</svg>
`;
}

writeFileSync(join(out, 'icon.svg'), svg({ pad: 150, radius: 224 }));

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
async function png(name, size, opts) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(opts)}`);
  await page.screenshot({ path: join(out, name), omitBackground: true });
  await page.close();
}
await png('icon-192.png', 192, { pad: 150, radius: 224 });
await png('icon-512.png', 512, { pad: 150, radius: 224 });
// Maskable: full-bleed background, glyph inside the central safe zone (80%).
await png('icon-512-maskable.png', 512, { pad: 230, radius: 0 });
await browser.close();
console.log('icons written to', out);
