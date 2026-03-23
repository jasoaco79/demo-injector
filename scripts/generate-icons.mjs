/**
 * Generate simple SVG-based PNG icons for the extension.
 * Uses canvas via a simple Node script.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'extension', 'icons');

const sizes = [16, 48, 128];

for (const size of sizes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#003366"/>
        <stop offset="100%" style="stop-color:#004d99"/>
      </linearGradient>
    </defs>
    <rect width="128" height="128" rx="24" fill="url(#bg)"/>
    <text x="64" y="78" text-anchor="middle" font-family="Arial Black, Arial" font-size="64" font-weight="900" fill="white">S</text>
    <circle cx="100" cy="28" r="16" fill="#22c55e"/>
    <text x="100" y="34" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="white">D</text>
  </svg>`;

  const svgPath = join(ICONS_DIR, `icon${size}.svg`);
  const pngPath = join(ICONS_DIR, `icon${size}.png`);

  writeFileSync(svgPath, svg);

  try {
    execSync(`convert -background none ${svgPath} -resize ${size}x${size} ${pngPath}`, { stdio: 'pipe' });
    console.log(`✅ icon${size}.png`);
  } catch {
    try {
      execSync(`rsvg-convert -w ${size} -h ${size} ${svgPath} -o ${pngPath}`, { stdio: 'pipe' });
      console.log(`✅ icon${size}.png (via rsvg)`);
    } catch {
      // Fallback: just use the SVG and hope Chrome handles it
      console.log(`⚠️  icon${size}.png — no converter found, creating minimal PNG`);
      // Create a tiny valid 1x1 PNG and scale note
      const minPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      writeFileSync(pngPath, minPng);
    }
  }
}

console.log('\nDone! Icons in extension/icons/');
