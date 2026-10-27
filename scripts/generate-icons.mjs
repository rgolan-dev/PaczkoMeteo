import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('static/icons', { recursive: true });
const source = await readFile('static/icon.svg');
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180], ['maskable-512', 512]]) {
  const svg = name === 'maskable-512' ? Buffer.from(source.toString().replace('rx="116"', 'rx="0"')) : source;
  await sharp(svg).resize(size, size).png().toFile(`static/icons/${name}.png`);
}
