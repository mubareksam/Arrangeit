/**
 * Generates every ArrangeIt icon from one vector master.
 *
 *   node scripts/make-icon.mjs
 *
 * The mark: a single geometric "A" — the ArrangeIt monogram — in warm white on a
 * frosted violet gradient tile. A letter survives 16 px better than any pictogram:
 * there is nothing to decode, no folder to mistake it for, and it reads as a brand
 * rather than a generic file utility.
 *
 * The .ico writer is hand-rolled on purpose: Windows only honours PNG-compressed
 * entries at 256 px, so 16/24/32/48/64/128 must be classic 32-bit DIBs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(root, "src-tauri", "icons");
mkdirSync(icons, { recursive: true });

const buildSvg = ({ stroke }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" gradientUnits="userSpaceOnUse" x1="96" y1="48" x2="936" y2="984">
      <stop offset="0" stop-color="#5F86FF"/>
      <stop offset="0.52" stop-color="#7C6BFF"/>
      <stop offset="1" stop-color="#B15CF2"/>
    </linearGradient>
    <linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="512" y1="0" x2="512" y2="640">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="330" y1="250" x2="700" y2="780">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#EFEAFF"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" rx="228" fill="url(#tile)"/>
  <rect width="1024" height="620" rx="228" fill="url(#sheen)"/>
  <path d="M-120 700L460 -120h150L30 700z" fill="#ffffff" opacity="0.06"/>
  <rect x="3" y="3" width="1018" height="1018" rx="226" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="6"/>

  <g fill="none" stroke="url(#ink)" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M352 762L512 262L672 762"/>
    <path d="M420 586h184"/>
  </g>
</svg>`;

/** Small sizes get a heavier stroke so the A stays solid at 16 px. */
const FINE = buildSvg({ stroke: 108 });
const BOLD = buildSvg({ stroke: 132 });

// Rasterise each master exactly once: librsvg is the slow part of this script.
const rasterise = async (svg) => sharp(Buffer.from(svg), { density: 384 }).png().toBuffer();
const master = await rasterise(FINE);
const boldMaster = await rasterise(BOLD);
const masterAt = (size) =>
  sharp(size <= 48 ? boldMaster : master).resize(size, size, { kernel: "lanczos3" });

const DIB_SIZES = [16, 24, 32, 48, 64, 128];
const PNG_256 = 256;


async function rgba(size) {
  const { data } = await masterAt(size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

function dib(buffer, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND planes
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(size * size * 4, 20);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const src = ((size - 1 - y) * size + x) * 4;
      const dst = (y * size + x) * 4;
      pixels[dst] = buffer[src + 2];
      pixels[dst + 1] = buffer[src + 1];
      pixels[dst + 2] = buffer[src];
      pixels[dst + 3] = buffer[src + 3];
    }
  }

  const maskStride = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskStride * size); // zeroed: every pixel is opaque
  return Buffer.concat([header, pixels, mask]);
}

async function buildIco() {
  const entries = [];
  for (const size of DIB_SIZES) {
    entries.push({ size, data: dib(await rgba(size), size) });
  }
  entries.push({ size: PNG_256, data: await masterAt(PNG_256).png().toBuffer() });

  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirEntries = [];
  for (const entry of entries) {
    const header = Buffer.alloc(16);
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0);
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1);
    header.writeUInt8(0, 2);
    header.writeUInt8(0, 3);
    header.writeUInt16LE(1, 4);
    header.writeUInt16LE(32, 6);
    header.writeUInt32LE(entry.data.length, 8);
    header.writeUInt32LE(offset, 12);
    dirEntries.push(header);
    offset += entry.data.length;
  }
  return Buffer.concat([dir, ...dirEntries, ...entries.map((entry) => entry.data)]);
}

const png = async (size, file) => {
  const buffer = await masterAt(size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(icons, file), buffer);
  return buffer.length;
};

writeFileSync(join(icons, "icon.ico"), await buildIco());
await png(512, "icon.png");
await png(32, "32x32.png");
await png(64, "64x64.png");
await png(128, "128x128.png");
await png(256, "128x128@2x.png");
await png(30, "Square30x30Logo.png");
await png(44, "Square44x44Logo.png");
await png(71, "Square71x71Logo.png");
await png(89, "Square89x89Logo.png");
await png(107, "Square107x107Logo.png");
await png(142, "Square142x142Logo.png");
await png(150, "Square150x150Logo.png");
await png(284, "Square284x284Logo.png");
await png(310, "Square310x310Logo.png");
await png(50, "StoreLogo.png");

// A preview PNG for the README / docs.
mkdirSync(join(root, "docs"), { recursive: true });
await masterAt(512).png().toFile(join(root, "docs", "icon.png"));

console.log("icons written:", DIB_SIZES.join(", "), "+", PNG_256, "(png)");
