---
name: image-design
description: Prompt engineering and generation pipelines for Midjourney-level image assets — wallpapers, backgrounds, product shots, social media graphics. Covers prompt structure, style control, composition, upscaling and batch generation across Midjourney, DALL-E, Flux and Stable Diffusion.
---

# Image design & generation (t8.1)

Prerequisites: t3.4 (layout and composition — for understanding visual hierarchy and safe zones). New tier: **Tier 8 — Creative AI**.

## When to use

When you need high-quality static images: phone/desktop wallpapers, video thumbnails, social media graphics, product mockups, background plates for video cards, or any visual asset where "flat vector art" is not good enough. The goal is photographic or painterly quality — the level Midjourney v6 produces.

## Technique

### 1. Prompt architecture

A strong prompt has five layers, in order:

1. **Subject** — what is in the image ("a crystal cave with bioluminescent formations")
2. **Style** — artistic direction ("cinematic photograph", "oil painting", "concept art", "hyperrealistic")
3. **Composition** — camera and framing ("wide-angle shot", "low angle", "rule of thirds", "depth of field f/1.4")
4. **Lighting** — mood driver ("golden hour rim light", "volumetric fog", "neon underglow", "studio Rembrandt")
5. **Quality modifiers** — technical polish ("8K", "highly detailed", "sharp focus", "award-winning")

**Negative prompts** (where supported): "blurry, deformed, text, watermark, oversaturated, flat, clipart, cartoon" — explicitly exclude the failure modes.

### 2. Platform-specific guidance

| Platform | Strengths | Prompt style |
|----------|-----------|-------------|
| **Midjourney v6** | Photorealism, lighting, composition | Natural language, `--ar 9:16 --style raw --s 250` |
| **DALL-E 3** | Text rendering, concept accuracy | Detailed description, ChatGPT refines |
| **Flux** | Speed, consistency, faces | Structured prompt, cfg 7–9 |
| **Stable Diffusion XL** | Control (ControlNet, IP-Adapter, LoRA) | Positive/negative split, samplers matter |

### 3. Wallpaper-specific rules

- Resolution: 2560×1440 (desktop) or 1290×2796 (iPhone 16 Pro Max) — always generate at 2× and downscale
- **No text** — wallpapers with text look amateur
- **Clock zone clear** — top 20% of a phone wallpaper must be low-contrast for the status bar
- **Dock zone calm** — bottom 15% should not have bright focal elements
- Color harmony: analogous or complementary, never more than 3 dominant hues
- Depth: foreground/midground/background layers create parallax potential

### 4. Batch generation

Generate 10–20 variations per concept, curate to the best 3–5. Seed locking for iterative refinement. Style transfer from a reference image (IP-Adapter or Midjourney `--sref`).

### 5. Upscaling

Topaz Gigapixel, Real-ESRGAN, or Magnific for 2–4× upscale after generation. Sharpen selectively (faces, architecture) not globally.

## Output

PNG or JPEG at target resolution. Metadata: prompt, seed, model, cfg, sampler, steps.

## Dependencies

- Access to one or more image generation platforms
- Upscaling tool (Real-ESRGAN CLI or Topaz)
- Color picker / palette tool for harmony checks

## Quality bar

- No visible artifacts (hands, text, deformed objects)
- Lighting is consistent across the scene (one light source direction)
- Composition follows rule of thirds or golden ratio
- Color palette is intentional (extractable as 5 swatches)
- Resolution matches target device exactly
- Would pass as a curated wallpaper on a wallpaper app — not "AI-generated looking"
