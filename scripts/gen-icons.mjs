// Generiert die PWA-Icons aus einem SVG-Logo via sharp.
// Aufruf: npm run icons
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = new URL("../public/", import.meta.url);
await mkdir(OUT, { recursive: true });

// "TH"-Monogramm: weiß auf Teal (Akzentfarbe der App, siehe src/styles/tokens.css).
// scale < 1 verkleinert das Monogramm für die Safe-Zone maskierbarer Icons.
const logo = (scale = 1, rounded = true) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#0f766e"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <!-- y enthält den Versatz für die Schrift-Grundlinie (~cap-height/2),
         damit "TH" optisch zentriert ist (librsvg ignoriert dominant-baseline) -->
    <text x="256" y="330" font-family="Helvetica, Arial, sans-serif" font-size="230"
          font-weight="700" letter-spacing="-6" fill="#ffffff" text-anchor="middle">TH</text>
  </g>
</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png();

async function write(name, buf) {
  await buf.toFile(new URL(name, OUT).pathname);
  console.log("✓", name);
}

await write("pwa-192x192.png", png(logo(1), 192));
await write("pwa-512x512.png", png(logo(1), 512));
await write("pwa-maskable-512x512.png", png(logo(0.72, false), 512)); // Safe-Zone, vollflächig
await write("apple-touch-icon.png", png(logo(1, false), 180)); // iOS rundet selbst

// favicon.svg (Vektor)
await writeFile(new URL("favicon.svg", OUT).pathname, logo(1).trim());
console.log("✓ favicon.svg");

console.log("Icons fertig.");
