/**
 * Generates every ArrangeIt icon from one vector master.
 *
 *   node scripts/make-icon.mjs
 *
 * The mark: a frosted gradient tile with a folder cut from it, and an arrow
 * punched *through* the folder in the tile's own gradient (a true negative
 * space hole, not a painted arrow). It reads at 16 px because the folder
 * silhouette survives while the arrow becomes a bright notch.
 *
 * The .ico writer is hand-rolled on purpose: Windows only honours PNG-compressed
 * entries at 256 px, so 16/32/48/64/128 must be classic 32-bit DIBs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(root, "src-tauri", "icons");
mkdirSync(icons, { recursive: true });

const DIB_SIZES = [16, 24, 32, 48, 64, 128];
const PNG_256 = 256;

const buildSvg = ({ stroke, head }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" gradientUnits="userSpaceOnUse" x1="96" y1="64" x2="928" y2="976">
      <stop offset="0" stop-color="#6D9BFF"/>
      <stop offset="0.52" stop-color="#7C7BFF"/>
      <stop offset="1" stop-color="#A26BF5"/>
    </linearGradient>
    <linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="512" y1="0" x2="512" y2="560">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="96" y1="64" x2="928" y2="976">
      <stop offset="0" stop-color="#4E7CF7"/>
      <stop offset="1" stop-color="#8C4FF0"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" rx="228" fill="url(#tile)"/>
  <rect width="1024" height="560" rx="228" fill="url(#sheen)"/>
  <rect x="3" y="3" width="1018" height="1018" rx="226" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="6"/>

  <g transform="translate(0,-40)">
    <!-- folder, white -->
    <path fill="#ffffff" d="M246 348h150a44 44 0 0 1 31 13l47 51h304a56 56 0 0 1 56 56v284a56 56 0 0 1-56 56H246a56 56 0 0 1-56-56V404a56 56 0 0 1 56-56z"/>

    <!-- arrow punched through the folder: same gradient = real hole -->
    <g fill="none" stroke="url(#ink)" stroke-width="62" stroke-linecap="round" stroke-linejoin="round">
      <path d="M400 712V560h158"/>
    </g>
    <path fill="url(#ink)" d="M${572 - head / 2} ${496 - head / 2}l${118 + head} ${64 + head / 2}-${118 + head} ${64 + head / 2}z"/>
  </g>
</svg>`;

/** Small sizes get a bolder arrow so the mark survives 16 px. */
const FINE = buildSvg({ stroke: 62, head: 0 });
const BOLD = buildSvg({ stroke: 92, head: 34 });

const masterFor = (svg, density = 384) => sharp(Buffer.from(svg), { density });
const master = masterFor(FINE);
const boldMaster = masterFor(BOLD);

async function rgba(size) {
  const source = size <= 48 ? boldMaster : master;
  const { data } = await sharp(await source.png().toBuffer())
    .resize(size, size, { fit: "cover", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
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
  entries.push({
    size: PNG_256,
    data: await sharp(await master.png().toBuffer()).resize(PNG_256, PNG_256).png().toBuffer(),
  });

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
  const source = size <= 48 ? boldMaster : master;
  const buffer = await sharp(await source.png().toBuffer())
    .resize(size, size, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
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
await sharp(await master.png().toBuffer()).resize(512, 512).png().toFile(join(root, "docs", "icon.png"));

console.log("icons written:", DIB_SIZES.join(", "), "+", PNG_256, "(png)");
