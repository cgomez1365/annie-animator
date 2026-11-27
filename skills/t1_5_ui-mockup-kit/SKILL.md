---
name: ui-mockup-kit
description: Builds the illustrated product screens inside a card's window - form fields with icons and growing fill bars, buttons that press and change label, prediction bubbles that pop with outBack, stat bars that fill and count up, stamps that slam with outElastic, toggles, sliding tabs and checkbox lists whose ticks draw. Use whenever a card has to show a tool "working" (a form being filled, a result appearing, a status updating, an approval), whenever a mockup looks like a static screenshot, or when a button, toggle or list needs to react, even if the request only says "show the app doing it".
---

# UI mockup kit (t1.5)

Prerequisites: t0.1 (easing), t1.1 (window frame), t1.2 (page transitions). Code: `module.mjs` on top of the engine. Read `engine/README.md` first.

## When to use

tt10's pages are illustrations of a tool, not screenshots: a field gets its text, a button is pressed and becomes "Checked in", a verdict is stamped. Every part below animates by its own start time `t0`, so you lay a page out like a score. Mockups are ILLUSTRATIONS: no real names, no real data, no prices, no unproven claims (check words against `engine/brand.mjs` BANNED). Text in a mockup is 42 px or more.

## Parts, numbers and calls

| Part | Call | Motion |
|---|---|---|
| Form field | `formField(ctx,t,{x,y,w:840,h:74,ic,t0,fillW,value})` y = top | box appears 0.2 s before t0; fill bar grows 0.5 s outCubic from x+80, 12 px high, then a blinking green caret; `value:'text'` types real text at 44 px, one letter per 60 ms |
| Button | `pressButton(ctx,t,{x,y,w:840,h:76,label,doneLabel,doneIcon,t0,pressT})` x,y = centre | fades in 0.25 s; at pressT scale 1 to 0.96 to 1 over 0.2 s; label swaps at pressT + 0.1 to icon + `doneLabel` |
| Prediction bubble | `bubble(ctx,t,{x,y,w,h,text,t0,tail:'bl'})` | `outBack(1.7)` over 0.5 s (10 percent overshoot), scaled about its tail, so it grows out of its source |
| Stat bar | `statBar(ctx,t,{x,y,w,label,value,t0,dur:0.8,color})` y = label baseline | fill outCubic and a percent that counts up; track 26 px |
| Stamp | `stamp(ctx,t,{x,y,text,t0,rot:-0.14,color})` returns the impact time | scale 2.2 to 1 with `outElastic(1,0.3)` over 0.8 s (crosses 1 several times); an ink ring expands 0.45 s; pair with `jolt(t, impact)` to shake the window 7 px for 0.35 s |
| Toggle | `toggle(ctx,t,{x,y,sx,label,t0,flipT,back})` | knob `outBack(1.8)` over 0.35 s, track colour mixes dim to green |
| Tabs | `tabs(ctx,t,{x,y,w,labels,switches:[[t,idx]],t0})` | underline slides 0.35 s inOutCubic, labels cross from muted to white |
| Checklist | `checkList(ctx,t,{x,y,items,t0,gap:64,ticks:[t...]})` | rows 0.14 s apart (0.4 s, 40 px slide); tick path DRAWS over 0.25 s while the box fills and the text dims |
| Signature pad | `signaturePad(ctx,t,{x,y,w,h,t0,pts:scribble(...)})` | line written over 1.0 s inOutSine |

Pure helpers for your own parts (all tested): `pressScale`, `labelAt`, `popScale`, `stampPose`, `jolt`, `toggleK`, `tabPos`, `tickK`, `countUp`, `appear`.

```js
pressButton(c, t, { x: 540, y: 1160, label: 'Check in', doneLabel: 'Checked in', t0: A.s + 1.1, pressT: A.s + 1.95 });
const impact = stamp(c, t, { x: 735, y: 905, text: 'LOGGED', t0: A.s + 2.35 });   // then wrap the window: translate(jolt(t, impact))
```

## Technique

1. Build the page as a score with local offsets from the page start `A.s` (see `demo.mjs`): fields 0.3 s apart, toggle, button, then the verdict. A page of 3.5 to 4.7 s holds 5 to 7 beats.
2. Order tells the story: input, choice, action, result. The button press is the hinge: nothing after it appears before `pressT + 0.1`.
3. Draw parts inside the page function so t1.2's slide moves them as one; parts that fade in by `t0` are fine under a sliding page.
4. Stamp last, over the form: the slam plus window jolt is the biggest beat; leave 0.5 s after it before anything else moves in.
5. Stat bars: one colour per bar (green, cyan), label left, percent right, values that add up (72 and 28).
6. Prediction bubble: put its tail toward the thing that "said" it; `tail:'bl'` grows from the bottom-left.
7. Geometry: window inner is `x 74..1006`; keep rows between x 110 and 930 (action rail rule below y 800). Rows are 62 to 94 px apart; the form in the demo is 850 to 1198.
8. Loops on top of this (t1.4) keep the page alive after the beats land: the fields' caret and the toggle are not enough alone.

## Common failures

- Text under 42 px: bubbles and chips are the usual culprit. Use 44 px and widen the shape.
- A stamp over text it hides: place it over empty fill space (demo: right half of the fields).
- Toggle label baseline vs the switch: `y` is the label baseline, the switch is drawn 52 px above it so they centre.
- Button label too long for 840 px at 44 px: about 40 characters max.
- Everything appearing at once: stagger by 0.15 to 0.3 s.
- Banned or unproven words in mock labels ("secure", "private", prices): the QC fails the run.

## Quality bar

- Press scale hits exactly 0.96 at the lowest point; label swaps at pressT + 0.1; bubble pop overshoots 7 to 13 percent; stamp starts at 2.2, ends at 1 and crosses its final size at least 3 times; toggle knob overshoots over 1.05; tab underline lands exactly on the index; tick done in 0.25 s (all unit-tested).
- Every part draws nothing before its t0 and more than 300 lit pixels after (real canvas); field fill bar width measured at fillW; the button is smaller while pressed; stat bar pixels grow; the toggle knob moves right; the tick stroke is drawn progressively.
- Demo 8 s, 1080x1920, silent, two tabs, QC passes.

## Run it

```
node test.mjs                      (full size, about 50 s)
ANNIE_PREVIEW=1 node test.mjs      (540x960, about 15 s)
```
Writes `out/demo.mp4`, `out/contact.png`, `out/qc.json`, `out/test_result.json`. Exit 0 only if every check passed.
