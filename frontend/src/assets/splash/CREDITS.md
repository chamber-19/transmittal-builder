# Splash Screen Asset Credits

## Artwork

### r3p-logo.svg / r3p-logo-transparent.svg
- **Description**: Hand-written SVG rendering of the R3P monogram — a chunky sans-serif R
  with an integrated 3 fused into its bowl, set on a rounded-square background (R3P blue
  `#1E5BCA`, white outline). `r3p-logo.svg` includes the opaque blue background;
  `r3p-logo-transparent.svg` has a transparent exterior for use on dark splash backgrounds.
- **Trademark notice**: The R3 monogram is a registered trademark of ROOT3POWER ENGINEERING.
  All rights reserved. Do not modify the letterform geometry or brand colors.
- **Use**: App icon master, splash header (`<img>` at 48×48), Windows Store tiles, ICO.

### sprocket-hammer.svg
- **Description**: Semi-photoreal SVG depicting a 16-tooth industrial sprocket with forged-steel
  gradient shading (multi-stop radial + forge-light angular overlay, chamfer specular ring, inner
  hub bore shadow) and a blacksmith's forging hammer with polished steel head and oak handle.
  Includes tooth-tip glow circles, impact flash, and 10
  spark elements. All paths are native vector (no embedded rasters).
- **Author**: Original work © R3P / ROOT3POWER ENGINEERING. Visual artwork regenerated using
  SVGMaker (`@genwave/svgmaker-mcp`) on 2026-04-18, then stitched with required CSS animation
  elements.
- **License**: Proprietary — all rights reserved.
- **Elements**: `#sprocket`, `#hammer`, `.tooth-glow-0`–`.tooth-glow-15`,
  `.spark-1`–`.spark-10`, `#impact-flash`. Animated entirely via
  `splash.css` keyframes.

### rust-logo.svg
- **Description**: Improved "Built with Rust" gear mark with multi-stop radial gradient shading
  (forge-lit from upper-left), specular highlights, and inner bore gradient. Regenerated using
  SVGMaker (`@genwave/svgmaker-mcp`) on 2026-04-18 as visual reference; geometry hand-fitted to
  the 100×100 viewBox.
- **Attribution**: Based on the Rust programming language logo (https://www.rust-lang.org/).
  The Rust logo is copyright the Rust Foundation, dual-licensed Apache 2.0 / MIT.
  Used here for "Built with Rust" attribution per rust-lang.org media guide.

### tauri-logo.svg
- **Description**: Improved "Powered by Tauri" concentric-ring mark with radial gradient fills,
  tick-mark highlights, and bore gradient. Regenerated using SVGMaker (`@genwave/svgmaker-mcp`)
  on 2026-04-18 as visual reference; geometry hand-fitted to the 100×100 viewBox.
- **Attribution**: Based on the official Tauri brand assets (MIT license per tauri.app).

## Sound Effects

### weld-loop.ogg
- **Status**: Not included — add a royalty-free ambient electric weld / crackle loop here.
- **Suggested source**: Freesound.org (search "electric arc loop") — filter by CC0 or CC BY.
- **Target duration**: 2–4 seconds, loopable
- **Volume**: The app plays it at 30% volume.
- When a sound is added, record the source URL, author, and license in this file.

### clank.ogg
- **Status**: Not included — add a royalty-free metallic clank / impact sound here.
- **Suggested source**: Freesound.org (search "metal clank impact") — filter by CC0 or CC BY.
- **Target duration**: < 1 second, single-shot
- **Volume**: The app plays it at 70% volume.
- When a sound is added, record the source URL, author, and license in this file.

## Graceful Degradation

The splash screen works correctly even when sound files are absent or fail to load.
All `audio.play()` calls are wrapped in `try/catch` and errors are silently ignored.
