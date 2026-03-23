# Spryte
A lightweight, data-driven pixel animation and tileset framework perfectly geared for game engine integration (e.g., Unity, Godot, and Bevy). Every export binds dynamic animation layouts directly to the texture atlas logic without hardcoding sprite numbers!

## Features
- **Smart Tools**: Draw, erase, and bucket-fill with pixel-perfect Bresenham continuous strokes.
- **Layers & Metadata**: Create named Animation Tracks (`idle`, `run`, `ui_panel`, etc.) which auto-export to parsed metadata.
- **Clipboard Tricks**: Slice arbitrary regions with the Marquee tool, hit `Ctrl+C`, and smoothly insert them back in-place using `Ctrl+V`. Use the Arrow Keys to gently nudge your selection.
- **Round-Trip Edits**: Click 'Load JSON + PNG' to parse any previously exported Spryte asset from your filesystem directly back into your workspace, completely restoring the layout, canvas size, and frame buffers natively!

## Building & Installation
Since Spryte runs exclusively on vanilla `HTML5`, native `CSS`, and standard `JavaScript`, **there are no heavy dependencies or build steps required.**
- Just double click `index.html` to open it in your browser, or quickly spin up a live-server of your choice (e.g., `python -m http.server`).

## Working in Metroidvania
If using Spryte to generate assets for a Metroidvania-style app:
1. Export your asset locally (e.g., as `banana_sprites.png` and `banana_sprites.json`).
2. Move both files into the target `assets/` directory in your game repo.
3. Because the generated `json` explicitly includes `tile_size`, `rows`, and `{ animation_name: [start, end] }`, your game engine's SpriteAtlas loader can ingest it fully dynamically!
