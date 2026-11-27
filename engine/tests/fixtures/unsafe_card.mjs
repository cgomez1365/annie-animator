// Deliberately unsafe: text above y 250, text in the action rail, text under 42 px, a banned word, and unreadable contrast.
import { META_BASE, base, text } from './_base.mjs';
export const META = { ...META_BASE };
export function frame(t) {
  const { cv, ctx } = base(t);
  text(ctx, 'Too high up', 120, 150, 64);
  text(ctx, 'RAIL TEXT HERE', 760, 1000, 60);
  text(ctx, 'Tiny but held', 120, 1100, 30);
  text(ctx, 'Totally private', 120, 1200, 60);
  text(ctx, 'Hard to read', 120, 700, 64, '#161b24');
  return cv;
}
