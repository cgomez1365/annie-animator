import { META_BASE, base, text } from './_base.mjs';
export const META = { ...META_BASE };
export function frame(t) { const { cv, ctx } = base(t); text(ctx, 'All clear here', 120, 700, 64); return cv; }
