// Generiert die PWA-Icons aus einem SVG-Logo via sharp.
// Aufruf: npm run icons
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = new URL("../public/", import.meta.url);
await mkdir(OUT, { recursive: true });

// "TH"-Monogramm in Orange auf dunklem Hintergrund
const logo = (scale = 1) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${96 * (1 / scale)}" fill="#09090f"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="190" fill="none" stroke="#f97316" stroke-width="20"/>
    <!-- y enthält den Versatz für die Schrift-Grundlinie (~cap-height/2),
         damit "TH" optisch im Kreis zentriert ist (librsvg ignoriert dominant-baseline) -->
    <text x="256" y="322" font-family="Helvetica, Arial, sans-serif" font-size="180"
          font-weight="700" fill="#f97316" text-anchor="middle">TH</text>
  </g>
</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png();

async function write(name, buf) {
  await buf.toFile(new URL(name, OUT).pathname);
  console.log("✓", name);
}

await write("pwa-192x192.png", png(logo(1), 192));
await write("pwa-512x512.png", png(logo(1), 512));
await write("pwa-maskable-512x512.png", png(logo(0.62), 512)); // Safe-Zone
await write("apple-touch-icon.png", png(logo(1), 180));

// favicon.svg (Vektor)
await writeFile(new URL("favicon.svg", OUT).pathname, logo(1).trim());
console.log("✓ favicon.svg");

console.log("Icons fertig.");
