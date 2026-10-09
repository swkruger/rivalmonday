import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { README_MARKERS, renderCoverageTable } from '../coverage';

const file = fileURLToPath(new URL('../../README.md', import.meta.url));
const text = await readFile(file, 'utf8');
const start = text.indexOf(README_MARKERS.start);
const end = text.indexOf(README_MARKERS.end);
if (start < 0 || end < start) throw new Error('README coverage markers not found');
await writeFile(file, `${text.slice(0, start + README_MARKERS.start.length)}\n${renderCoverageTable()}\n${text.slice(end)}`, 'utf8');
console.log('README coverage table updated');
