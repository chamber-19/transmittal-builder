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
- **Description**: Hand-written SVG depicting a 16-tooth engineering sprocket (rotating CCW
  during WELDING phase) with a hammer poised to strike the top tooth at 12 o'clock. Includes
  tooth-tip glow circles, a rim-glow path, electric-arc overlay, impact flash, and 10 spark
  elements. All paths are native vector (no embedded rasters).
- **Author**: Original work © R3P / ROOT3POWER ENGINEERING
- **License**: Proprietary — all rights reserved.
- **Elements**: `#sprocket`, `#hammer`, `#rim-glow`, `.tooth-glow-0`–`.tooth-glow-15`,
  `#electric-arc`, `.spark-1`–`.spark-10`, `#impact-flash`. Animated entirely via
  `splash.css` keyframes.

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
