---
name: data-motion
description: Animates data for a phone screen: bar charts (rows or columns) that grow with a stagger and count their values, smooth line charts that draw themselves with a pulsing head dot, sparklines, donuts that sweep round, counting numbers with safe formatting, legends, delta badges and a two-bar comparison reveal. Use whenever a card must show numbers, a trend, a share or a before/after, even if the request only says "show that it went up" or "make the stat land".
---

# Data motion (t3.3)

Prerequisites: t0.1 (easing), t0.2 (timeline), t0.3 (render), t0.4 (checker). Code: `module.mjs` on the engine. Demo: `demo.mjs` (8 s: comparison reveal + sparkline, two-series line chart, donut with counting centre).

## When to use

One number or one comparison per page. Phone readable means: at most 6 rows, 5 columns, 3 line series, 5 donut slices; every label 42 px or more; one highlighted winner. If the story is "A beat B", use `compareReveal`, not a five-bar chart. Data in demos is made up: do not present it as a result. No currency signs (prices are banned claims), no unproven claims in labels.

## Technique

1. Plan first: `readability(ctx, 'hbar', {labels, w, px})` returns problems (too many items, label wider than 40 percent of the chart, text under 42 px, more than one decimal). Fix the plan, not the chart.
2. Entrance: bars grow from the baseline staggered 0.1-0.12 s, 0.55-0.65 s each, `outBack(1.4)` (a small tip overshoot, at most 15 percent, tested). Value labels count with `outCubic` and never overshoot: a number must not pass its target. Line charts draw over 1.1-1.4 s `inOutCubic`; donuts sweep 0.9-1.2 s; counters 0.9-1.4 s `outExpo`.
3. Order: container (window) 0.4 s, then axis labels, then data, then the highlight, then the delta badge. The data finishes at least 0.6 s before the page leaves.
4. Keep it alive after landing (the QC fails still holds): `scan:1.6` sweeps a highlight over bars, line heads pulse (built in), the donut has an orbiting spark (built in), the winner bar glows on a sine.
5. Highlight one: `highlight:i` makes that bar green with a glow and white label; all others cyan or dim. Never colour every bar differently.

### Calls

- `barChart(ctx, t, {x,y,w,h,data:[{label,value,color?}], t0, orient:'h'|'v', highlight, scan, barMax, valueFmt, max})` returns the bar rectangles (`tip`, `w`, `k`). Rows: label left, value at the tip. Columns: value above, label below.
- `lineChart(ctx, t, {x,y,w,h,series:[{values,color,area}], t0, dur, xLabels, max, min, valueFmt})` returns `{heads, plot, k}`. Smooth monotone curve (no overshoot below the data), area fill under series 0, gridlines, head value label. Keep x labels to 3-5.
- `sparkline(ctx, t, {x,y,w,h,values,color,t0})` for rows and cards (160-630 px wide).
- `donutChart(ctx, t, {cx,cy,r,thick,slices,t0,highlight})` returns each slice's angles and fill; draw the centre with `drawNumber(ctx, fmt(easeNumber(t,{to:62,t0,dur,ease:'outCubic'}),{suffix:'%'}), {x,y,px:112,t,popT})` and a `legend(ctx, t, {x,y,w,items,t0})`.
- `compareReveal(ctx, t, {x,y,w,h,a:{label,value},b:{...},t0,badgeAt})`: two bars, winner green, delta badge pops after (`+71%`). Returns `{pct, bars}`.
- Numbers: `fmt(v,{decimals,compact,suffix,prefix})` ('1,284', '1.5K', '2M'), `easeNumber`, `niceMax` (87 -> 100, 41 -> 50), `monotoneSamples`.

## Common failures

- Value text at x >= 940 inside y 800-1580 fails the checker: keep charts at x 110 to 930 (w 820 from x 110).
- More than 6 bars or labels like "Average response time last quarter": cut the data, shorten the label, or use rows.
- Colouring by category AND highlighting: two ideas. One colour plus one accent.
- Axis labels under 42 px "because there is no room": drop labels (first and last only) instead.
- Number easing with `outBack`: the count passes the final value and shows a wrong number for a moment. Use outExpo/outCubic.
- Drawing charts at t before t0 and hiding them with alpha: bars at k = 0 are skipped already; do not add your own.
- A donut with a slice under 4 percent: it vanishes; merge it into "Other".
- Percentages that do not add to 100 in the labels you draw yourself: compute them from the same slice values.

## API (`module.mjs`)

`SERIES`, `fmt`, `easeNumber`, `niceMax`, `readability`, `monotoneSamples`, `barChart`, `lineChart`, `sparkline`, `donutChart`, `drawNumber`, `legend`, `deltaBadge`, `compareReveal`.

## Quality bar (measurable)

- `fmt` formats separators, decimals, compact, prefix and suffix; never a currency sign. `easeNumber` lands exactly, is monotonic and never overshoots.
- Bars: nothing grown before t0; lengths exactly proportional to values (B twice A); full growth lands at exactly 1; outBack overshoot stays between 2 and 15 percent; highlighted bar is green; vertical heights proportional.
- Line: head x moves right, lands on the last value, stays inside the plot; the curve is drawn (thick green line pixels); monotone interpolation passes through every point and never dips on rising data or leaves the data range.
- Donut: empty before t0, full after; slices fill in order; shares sum to 1; slices plus gaps close the circle; slice colours sit where the angles say; centre empty.
- Badge, legend and number appear only after their start time; compareReveal reports +71 percent for 24 to 41 and -50 for 50 to 25.
- Demo: engine QC passes on the card and on the mp4 (safe zones, 42 px floor, no frozen frames, closer present); no `Math.random`, `Date` or currency sign.

## Run it

`node test.mjs` (add `ANNIE_PREVIEW=1` for a fast 540x960 run). Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/qc_zones.png`. Exit 0 only if everything passes.
