// The same frozen segment, but declared as a hold: must pass.
import { META_BASE, base, text } from './_base.mjs';
export const META = { ...META_BASE, holds: [[0.9, 2.6]] };
export function frame(t) { const { cv, ctx } = base(t, { dotMoves: t => t < 1.0 || t > 2.5 }); text(ctx, 'A declared hold', 120, 700, 64); return cv; }
