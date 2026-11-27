// t0.4 quality-checker: use the checker while you draw (pre-checks) and read its verdict in plain words (after).
import { qcCard } from '../../engine/qc.mjs';
import { SAFE, claimViolations } from '../../engine/brand.mjs';
import { hex } from '../../engine/ease.mjs';

/**
 * What every QC rule means and how to fix it. Keys are the start of the rule text in qc.json.
 * @type {{match:RegExp,what:string,fix:string}[]}
 */
export const FIXES = [
  { match: /^frozen frames/, what: 'Nothing on screen moved for more than half a second.', fix: 'Add a mover to the hold: a marker loop, a highlight sweep, a pulse. Or declare the pause in META.holds = [[t0,t1]] if it is on purpose.' },
  { match: /^text above y 250/, what: 'Text sits under the app\'s top bar.', fix: 'Move it down to y 250 or lower (the kicker lives at y 300).' },
  { match: /^text below y 1580/, what: 'Text sits under the caption band.', fix: 'Move it up so its bottom edge is above y 1580 (ideally above y 1250).' },
  { match: /^text in the action rail/, what: 'Text is under the like/comment buttons.', fix: 'Keep text right edge at x 930 or less when it is between y 800 and y 1580. Shrink or wrap the line.' },
  { match: /^text under 42 px/, what: 'Text is too small to read on a phone for more than half a second.', fix: 'Make it 42 px or larger. Use fitText with minPx 42, or cut words. Pure texture text may use decor(ctx).' },
  { match: /^low contrast/, what: 'Text is hard to read against what is behind it.', fix: 'Use P.white or P.text on dark panels, never P.dim for words. Put a panel behind text that sits over busy art.' },
  { match: /^banned claim/, what: 'A word the brand never uses in ads.', fix: 'Rewrite the line. No prices, no private/secure/offline/forever, no competitor names, no Gumroad.' },
  { match: /^closer/, what: 'The ending is missing a piece.', fix: 'End with the engine closer: end(ctx, t, { closerAt }). It draws the slogan pair, Follow and the footer. AEON cards also need brand: \'aeon\' in META and the closer.' },
  { match: /^(size|fps|duration|video )/, what: 'The file or META is not 1080x1920, 30 fps, 1-90 s.', fix: 'Fix META (W 1080, H 1920, fps 30) and render with the engine.' },
  { match: /^text in the Reels caption band/, what: 'Text is in the Reels caption area (a warning, not a failure).', fix: 'Move it above y 1250 if you can.' },
];

/**
 * Plain-language explanation of one QC issue.
 * @param {{rule:string,detail?:string,level:string}} issue @returns {{what:string,fix:string}}
 */
export function explain(issue) { return FIXES.find(f => f.match.test(issue.rule)) || { what: issue.rule, fix: 'See engine/README.md, QC rules.' }; }

/**
 * Run the checker and return short plain lines for a person or an agent: one line per issue with the fix.
 * @param {string} cardPath @param {{out?:string,step?:number}} [o] @returns {Promise<{pass:boolean,lines:string[],result:object}>}
 */
export async function lint(cardPath, o = {}) {
  const result = await qcCard(cardPath, o);
  const lines = result.issues.map(i => `${i.level === 'fail' ? 'FIX' : 'note'}: ${explain(i).what} (${i.detail}) -> ${explain(i).fix}`);
  return { pass: result.pass, lines: lines.length ? lines : ['clean: no issues'], result };
}

/**
 * Pre-check a text box while drawing, before the checker runs. box is in frame pixels {x0,y0,x1,y1}.
 * @param {{x0:number,y0:number,x1:number,y1:number}} box
 * @returns {{ok:boolean,problems:string[],nudge:{dx:number,dy:number}}} nudge = the smallest move that fixes zone problems
 */
export function checkBox(box) {
  const problems = []; let dx = 0, dy = 0;
  if (box.y0 < SAFE.top) { problems.push('above y 250'); dy = SAFE.top - box.y0; }
  if (box.y1 + dy >= SAFE.bottom) { problems.push('below y 1580'); dy = SAFE.bottom - 1 - box.y1; }
  if (box.x1 > SAFE.railX && box.y1 + dy > SAFE.railY[0] && box.y0 + dy < SAFE.railY[1]) { problems.push('in the action rail'); dx = SAFE.railX - box.x1; }
  return { ok: problems.length === 0, problems, nudge: { dx, dy } };
}

/** Smallest font size that passes the floor, given a wanted size: never below 42. @param {number} px @returns {number} */
export const floorPx = px => Math.max(SAFE.floor, px);

const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
/**
 * WCAG contrast ratio of two '#rrggbb' colours (the number the checker uses). 3 is the hard floor, 4.5 is comfortable.
 * @param {string} a @param {string} b @returns {number}
 */
export function contrastRatio(a, b) {
  const L = h => { const [r, g, bl] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl); }, x = L(a), y = L(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Banned-claim pre-check for a string while writing copy. @param {string} s @returns {string[]} labels of broken rules */
export const claims = claimViolations;
