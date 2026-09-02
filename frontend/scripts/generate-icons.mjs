import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import sharp from "sharp";
import { sisyphus as theme } from "@nocturne-rose/sisyphus";

const check = process.argv.includes("--check");
const output = check ? await mkdtemp(join(tmpdir(), "sisyphus-icons-")) : new URL("../public/icons/", import.meta.url).pathname;

const svg = (size, scale) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${theme.canvas}"/>
  <g transform="translate(50 52) scale(${scale}) translate(-50 -52)">
    <path d="M 2 88 L 86 30 L 100 30 L 100 100 L 0 100 L 0 88 Z" fill="${theme.surfaceRaised}"/>
    <path d="M 2 88 L 86 30" stroke="${theme.surfaceActive}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="56" cy="38" r="17" fill="${theme.accent}"/>
    <circle cx="51" cy="33" r="5" fill="${theme.accentStrong}" opacity="0.55"/>
  </g>
</svg>`);

const targets = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, scale: 1 },
];

const mismatches = [];
for (const target of targets) {
  const generated = await sharp(svg(target.size, target.scale)).png().toBuffer();
  const path = join(output, target.file);
  if (check) {
    const committed = await readFile(new URL(`../public/icons/${target.file}`, import.meta.url));
    if (!generated.equals(committed)) mismatches.push(target.file);
  } else {
    await sharp(generated).toFile(path);
  }
}

if (check) await rm(output, { recursive: true, force: true });
if (mismatches.length) throw new Error(`Stale generated icons: ${mismatches.join(", ")}. Run npm run icons:generate.`);
console.log(`${check ? "Verified" : "Generated"} ${targets.length} Nocturne Rose icons.`);
