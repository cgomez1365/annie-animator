// t6.2 helper process: draws the given frames of a card forward and then in reverse order in ONE fresh process and prints the pixel
// hashes as JSON. node detproc.mjs <card.mjs> <preview 0|1> <i,i,i...>   (also: node detproc.mjs <card.mjs> meta  prints META)
import crypto from 'node:crypto';
import { loadCard, renderFrame } from '../../engine/render.mjs';
const [card, mode, list] = process.argv.slice(2), c = await loadCard(card);
if (mode === 'meta') { console.log(JSON.stringify(c.META)); process.exit(0); }
if (c.init) await c.init();
const idx = list.split(',').map(Number), hash = i => crypto.createHash('sha1').update(renderFrame(c, i, { preview: mode === '1' }).toBuffer('image/png')).digest('hex');
console.log(JSON.stringify({ a: Object.fromEntries(idx.map(i => [i, hash(i)])), b: Object.fromEntries([...idx].reverse().map(i => [i, hash(i)])) }));
process.exit(0);
