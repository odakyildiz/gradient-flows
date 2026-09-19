// Regenerate display-size portraits without changing the original photographs.
// Run from any directory with: node web/scripts/optimise-speaker-images.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const speakers = fileURLToPath(new URL('../speakers/', import.meta.url));
const output = join(speakers, 'optimised');
mkdirSync(output, { recursive: true });
const portraits = [
  ['agazzi.png', 0.30],
  ['borghi.jpg', 0.50],
  ['crucinio.jpeg', 0.44],
  ['duncan.jpeg', 0.50],
  ['korba.jpeg', 0.40],
  ['monmarche.jpg', 0.38],
  ['shalova.jpg', 0.40],
  ['vaes.jpg', 0.50],
  ['zahm.png', 0.40],
];

for (const [filename, position] of portraits) {
  const source = join(speakers, filename);
  const [width, height] = execFileSync('magick', ['identify', '-format', '%w %h', source], { encoding: 'utf8' }).split(' ').map(Number);
  const side = Math.min(width, height);
  const x = Math.round((width - side) * 0.5);
  const y = Math.round((height - side) * position);
  const name = filename.replace(/\.[^.]+$/, '');
  for (const size of [172, 344, 516].filter(size => size <= side)) {
    execFileSync('magick', [
      source, '-auto-orient', '-colorspace', 'sRGB',
      '-crop', `${side}x${side}+${x}+${y}`, '+repage',
      '-filter', 'Lanczos', '-define', 'filter:blur=1.05',
      '-resize', `${size}x${size}`,
      '-unsharp', '0x0.4+0.35+0.03',
      '-strip', '-quality', '88', join(output, `${name}-${size}.webp`),
    ]);
  }
  console.log(`Optimised ${filename}`);
}
