# Splash Screen Asset Credits

## Logo Attributions

### Rust Logo (rust-logo.svg)
- **Description**: 10-tooth gear SVG approximating the official Rust brand mark
- **Source**: Based on the Rust programming language logo at https://www.rust-lang.org/
- **License**: The Rust logo is copyright the Rust Foundation, dual-licensed under Apache 2.0 / MIT.
- **Note**: Recreation for "Built with Rust" attribution purposes per the rust-lang.org media guide.

### Tauri Logo (tauri-logo.svg)
- **Description**: SVG recreation of the Tauri v2 logo
- **Source**: Based on official Tauri brand assets at https://tauri.app/
- **License**: MIT License — Copyright (c) 2019-present Tauri Programme within The Commons Conservancy
- **Note**: Recreation for "Powered by Tauri" attribution purposes per Tauri brand guidelines.

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
