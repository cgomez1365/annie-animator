---
name: the-closer
description: Ends a BGI card the way every card ends - the hook lifts out, the window, headers and kicker fade together, then the ground, gear mark, wordmark, the slogan (both lines together, line 2 green), a glowing Follow button that presses once, the brand footer and, for AEON cards, the 18+ line come up and hold. Use whenever a card is being finished or timed, whenever the last seconds look abrupt or the quality checker reports a missing closer element, or when deciding how long a card must run after its last page, even if the request only says "add the end card".
---

# The closer (t1.6)

Prerequisites: t0.1 (easing), t1.1 (window leave), t1.2 (header timing). Code: `module.mjs`; `drawCloser` reproduces `engine/parts.mjs closer()` exactly by default and adds options. Read `engine/README.md` first.

## When to use

Every card ends on the closer: BGI promotes itself on every card (CEO 10-27: "promote broken gear industries not just aeon"). The checker requires, in the second half of the card: the slogan pair with line 2 in `#19e08f`, a Follow button, the footer, and for `META.brand = 'aeon'` the 18+ line. Use this skill to time the hand-over and draw the closer. Call it LAST in `frame()`.

## The choreography (extracted from tt10 and the engine)

All times are seconds after the closer's start `t0` (called `closerAt` when you set it in the card):

| Beat | Time | Motion |
|---|---|---|
| Hook out | its own `tOut`, gone at `tOut + 0.2` | 0.2 s fade and 10 px lift (engine `hook`). It must be gone BEFORE the window leaves. |
| Window, headers, kicker leave | `t0 - 0.1` to `t0 + 0.3` | alpha 1 to 0 together (`fadeOut(t, closerAt)`) |
| Ground (opaque `#0a0c10` plus a faint green glow) | `t0` to `t0 + 0.5` | `outCubic` alpha, covers whatever is left |
| Gear mark | `t0` to `t0 + 0.8` | drawn like a CAD sketch: crosshair, outline traces, left half fills white |
| Wordmark BROKEN GEAR / INDUSTRIES | `t0 + 0.1` to `t0 + 0.5` | fade |
| Slogan line 1 (white) | `t0 + 0.35` to `+ 0.8` | rises 18 px, `outCubic`, 60 px Space Grotesk 700 |
| Slogan line 2 (green) | `t0 + 0.55` to `+ 1.0` | same, 0.2 s later |
| Follow button | `t0 + 0.8` to `+ 1.2` | `outBack(1.8)` pop; then breathes (1.6 s period, glow 30 to 48 px) |
| Footer | `t0 + 0.8` to `+ 1.15` | fade |
| Press | `t0 + 1.9` to `+ 2.1` | button scale 1 to 0.96 to 1, once |
| Reveal complete | `t0 + 1.2` | the card must still run until at least `t0 + 3.1` |

Layout (y): BGI: mark 330 px at 500, name 790, sub 856, slogan 975 and 1057, button 1130, footer 1226. AEON: mark 250 px at 430, name 650, sub 706, slogan 840 and 918, button 990, footer 1076, 18+ lines 1152 and 1198. Everything sits between y 300 and y 1240.

## API (`module.mjs`)

- `choreography(closerAt, {hookTOut})` -> every absolute time above plus `end` (= `closerAt + 3.1`).
- `fadeOut(t, closerAt)` -> alpha for the window, headers, kicker and loose objects.
- `validateCloser({closerAt, duration, brand, metaBrand, hookTOut})` -> issues. Fails: under 2.5 s after `closerAt`, closer in the first half, brand `'aeon'` without `META.brand = 'aeon'`, hook still up when the window leaves. Warns: under 3.1 s.
- `drawCloser(ctx, t, t0, {brand, cta, follow, pressAt, glowK, mark, dustN})`. `brand` `'bgi'` (default) or `'aeon'` (adds the 18+ line: `EIGHTEEN` split at the comma, never shortened). `cta` replaces the footer text. `follow` replaces "Follow for more". `pressAt: false` = no press. `glowK` 0 to 1.5.
- `drawSlogan(ctx, t, t0, y1, y2)` and `drawFollow(ctx, t, t0, y, o)` for custom layouts. The slogan text has NO parameter: it is brand law.

```js
export const META = { W: 1080, H: 1920, fps: 30, frames: 240, brand: 'aeon' };      // brand 'aeon' makes the checker demand the 18+ line
const CLOSER = 4.5;                                                                  // 4.5 + 3.1 = 7.6 s: a 240 frame card
hook(ctx, HOOK, t);                                                                  // HOOK.tOut 1.5: gone at 1.7
drawWindow(ctx, t, { enterAt: 1.35, closerAt: CLOSER }, content);                    // leaves 4.4 to 4.8
drawCloser(ctx, t, CLOSER, { brand: 'aeon' });                                       // last
```

## Technique

1. Work backwards: `duration = closerAt + 3.1` at least. tt10 holds its end card 3.35 s.
2. Put `closerAt` in ONE constant and give it to `begin(t, {closerAt})` (it fades the kicker), `drawWindow({closerAt})`, and the headers (their `tOut` is 0.3 s before the page ends, which is before `closerAt - 0.1` for the last page).
3. Last page may end as late as `closerAt + 0.3`: the closer's ground covers its slide-out.
4. Do not draw anything after `drawCloser`.
5. AEON cards: `brand: 'aeon'` in BOTH `META` and `drawCloser`. Claim rules: no prices, no client names, "private" only with Local only.
6. The footer is the site only: `brokengearindustries.com` (BGI) or `brokengearindustries.com/aeon` (AEON).
7. Never put the closer in the first half of the card or the checker does not look for it.
8. The press at `t0 + 1.9` leaves about 1 s of rest after it at the minimum length; a longer card rests longer on the footer, which is fine.

## Common failures

- Card ends at `closerAt + 2`: the footer has 0.8 s of rest. `validateCloser` warns.
- Hook still fading while the window leaves: two things leave at once and the eye does not know where to look.
- Slogan drawn on its own or with another line: brand rule, both lines always together.
- Window not faded with the kicker: ghost frame under the closer ground. Use `fadeOut` for everything that was not part of the closer.
- Slogan line 1 over the action rail: 60 px keeps it left of x 930. Do not enlarge it.
- Forgetting `META.brand = 'aeon'` on an AEON card: the checker cannot enforce the 18+ line.

## Quality bar

- Pixel equality with the engine's `closer()` for both brands at six times from `t0 + 0.2` to `t0 + 2.8` (at most 40 differing pixels).
- Slogan line 1 white and line 2 `#19e08f` (colour counts in their rows), line 1 ends left of x 930, both lines are always drawn together.
- AEON: 18+ line in both halves; BGI: none. Footers are the brand URLs. Nothing before `t0`.
- Follow button squeezes at least 2.5 percent at the press (measured width) and not with `pressAt: false`; it breathes; the closer changes between frames 0.2 s apart in its hold.
- Demo: 8 s, 1080x1920, silent, AEON variant, QC passes (slogan pair, Follow, footer, 18+ found in the second half).

## Run it

```
node test.mjs                      (full size, about 50 s)
ANNIE_PREVIEW=1 node test.mjs      (540x960, about 15 s)
```
Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/test_result.json`. Exit 0 only if every check passed.
