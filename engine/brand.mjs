// Annie engine: BGI brand constants. One place for palette, fonts, safe zones, closer strings and the banned-claim list.

/** Palette (BGI site and the tt cards). */
export const P = {
  bg: '#0a0c10', panel: '#0d1117', panel2: '#11161d', white: '#f8fafc', text: '#cbd5e1', muted: '#94a3b8', dim: '#475569', faint: '#8190a5',
  accent: '#00c97a', green: '#19e08f', cyan: '#22d3ee', red: '#ef4444', orange: '#f59e0b', ink: '#04140c',
};

/** Font stacks. Weights are set through fontVariationSettings (setFont does it). 'sg' = headlines, 'inter' = body, 'mono' = labels. */
export const STACK = {
  mono: '"JetBrains Mono", Menlo, "Apple Color Emoji"',
  sg: '"Space Grotesk", Menlo, "Apple Color Emoji"',
  inter: 'Inter, Menlo',
};

/** Canvas and safe zones for TikTok / Reels / Shorts (as gated on 2026-10-03). Text must stay clear of red zones. */
export const SAFE = {
  W: 1080, H: 1920, fps: 30,
  top: 250,            // no text above y 250 (lesson badge lives there)
  bottom: 1580,        // no text from y 1580 down (caption band)
  railX: 940, railY: [800, 1580], // action rail: no text with x >= 940 between y 800 and 1580
  soft: [1250, 1580],  // Reels caption band: avoid, allowed with a warning
  floor: 42,           // smallest readable text, px, for anything held on screen more than 0.5 s
  window: { x: 72, y: 560, w: 936, h: 640 }, // default teaching window
};

/** The official slogan: both lines always together, line 2 in green (CEO 2026-10-27). */
export const SLOGAN = ['Be the cog in the machine.', 'Tools that work for you.'];
export const SLOGAN_COLORS = ['#ffffff', P.green];
/** Closer strings. */
export const CTA = { follow: 'Follow for more', label: 'Follow' };
export const FOOTER = { bgi: 'brokengearindustries.com', aeon: 'brokengearindustries.com/aeon' };
export const KICKER = 'BROKEN GEAR INDUSTRIES';
/** AEON cards carry this line. It must be written in full, with this wording. */
export const EIGHTEEN = 'AEON is for adults: 18+, or the age of majority where you live.';

/**
 * Words and claims that never go in an ad (from check-card.mjs; CEO claim rules 10-25 / 10-26). Whole words, case-insensitive.
 * "private" is banned outright: the Local only guardrail must sit on another line, and QC reads one string at a time.
 * Each entry: [label, RegExp].
 */
export const BANNED = [
  ['private/privacy (needs the Local only guardrail)', /\bprivate(ly)?\b|\bprivacy\b/i],
  ['offline (not proven)', /\boffline\b/i],
  ['secure', /\bsecur(e|ely|ity)\b/i],
  ['just works', /\bjust works?\b/i],
  ['forever / unlimited', /\bforever\b|\bunlimited\b/i],
  ['no data leaves', /\bno data\b|\bnever leaves?\b/i],
  ['price', /[$€£]\s?\d|\b\d+(\.\d+)?\s?(dollars|usd)\b|\/\s?mo\b|\bper month\b/i],
  ['Viz Music / Talent (not for sale yet)', /\bviz\b|\btalent\b/i],
  ['competitor name', /\bbase\s?44\b|\bsetapp\b|\blm studio\b|\banythingllm\b|\bjan\b|\bmsty\b|\bopen webui\b/i],
  ['B Corp / employee-owned', /\bb[\s-]?corp\b|\bemployee[\s-]owned\b/i],
  ['Gumroad (the private block; ads point at the site)', /\bgumroad\b/i],
];
/** Labels of the banned rules a string breaks (empty array = clean). @param {string} s @returns {string[]} */
export const claimViolations = s => BANNED.filter(([, re]) => re.test(s)).map(([label]) => label);
