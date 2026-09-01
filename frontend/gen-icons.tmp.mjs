import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/Users/mbastakis/dev/personal/workspaces/home-workspace/sisyphus/sisyphus_main/frontend/public/icons";
mkdirSync(OUT, { recursive: true });

// Boulder on a slope, Nocturne Rose. scale controls glyph size within the
// canvas (maskable icons need the glyph inside the central 80% safe zone).
const svg = (size, { radius, scale }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <clipPath id="r"><rect width="100" height="100" rx="${radius}"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="100" height="100" fill="#0d0d10"/>
    <g transform="translate(50 52) scale(${scale}) translate(-50 -52)">
      <path d="M 2 88 L 86 30 L 100 30 L 100 100 L 0 100 L 0 88 Z" fill="#22222c"/>
      <path d="M 2 88 L 86 30" stroke="#30303d" stroke-width="3" stroke-linecap="round"/>
      <circle cx="56" cy="38" r="17" fill="#d48aa4"/>
      <circle cx="51" cy="33" r="5" fill="#e3a0b8" opacity="0.55"/>
    </g>
  </g>
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192, radius: 0, scale: 1 },
  { file: "icon-512.png", size: 512, radius: 0, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, radius: 0, scale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, scale: 1 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<body style="margin:0">${svg(t.size, t)}</body>`
  );
  await page.screenshot({ path: `${OUT}/${t.file}` });
  console.log(t.file, "written");
}
await browser.close();
