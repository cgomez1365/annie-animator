// Deliberately frozen: the dot stops moving from 1.0 s to 2.5 s (1.5 s of stillness).
import { META_BASE, base, text } from './_base.mjs';
export const META = { ...META_BASE };
export function frame(t) { const { cv, ctx } = base(t, { dotMoves: t => t < 1.0 || t > 2.5 }); text(ctx, 'Nothing moves', 120, 700, 64); return cv; }
