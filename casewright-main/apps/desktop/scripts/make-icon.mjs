// Generate the app icons from the shared brand mark (@casewright/brand/logo-mark.svg):
//   build-resources/icon.ico — embedded in Casewright.exe by the packaging pipeline.
//   build-resources/icon.png — the NW.js `window.icon` (taskbar/window icon at runtime,
//                              including `pnpm dev` and `nw .`, where there's no .exe icon).
// Both are committed so the build never needs a rasterizer; re-run `pnpm make-icon`
// whenever the mark changes. Sizes follow the standard Windows icon ladder (16…256).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const repoRoot = join(here, '..', '..', '..');
const svgPath = join(repoRoot, 'packages', 'brand', 'logo-mark.svg');
const outDir = join(here, '..', 'build-resources');
const outFile = join(outDir, 'icon.ico');
const pngFile = join(outDir, 'icon.png');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

const svg = readFileSync(svgPath);

// Render the 48px-viewBox mark at a high density so downscales stay crisp; the
// largest icon (256) renders 1:1 at density 384 (48 * 384/72 = 256).
const pngs = await Promise.all(
  SIZES.map((size) =>
    sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, await pngToIco(pngs));
writeFileSync(pngFile, pngs[pngs.length - 1]); // 256px PNG for NW.js window.icon

console.log(`✓ wrote ${outFile} (${SIZES.join(', ')} px)`);
console.log(`✓ wrote ${pngFile} (${SIZES[SIZES.length - 1]} px)`);
