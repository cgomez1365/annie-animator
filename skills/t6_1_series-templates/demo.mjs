// t6.1 demo: episode 2 of the five-part "Studio Notes" series, drawn by the series template from series.json (7.5 s).
import fs from 'node:fs';
import { makeCard } from './module.mjs';
const series = JSON.parse(fs.readFileSync(new URL('./series.json', import.meta.url), 'utf8'));
const card = makeCard(series, 2);
export const META = card.META;
export const frame = card.frame;
