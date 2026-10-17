# Changelog

## [0.5.0] - 2026-10-17

### Added
- **KeyMixer Compositing Node**: High-performance multi-input WebGPU shader supporting Luma Keying (luminance thresholds) and Chroma Keying (color matching with green/blue edge spill suppression, mask inversion, and B&W matte preview).
- **Radial & Jitter Pattern Engine**: Major overhaul of the `Pattern` shader adding concentric circular tiling (Radial mode with configurable rings and angular sectors), per-tile incremental rotation, pseudo-random jitter displacement, and external video-signal UV distortion (`uv_distort_in`).
- **Video Math Module**: Multi-input algebraic texture processor performing real-time GPU operations (`Add`, `Subtract`, `Multiply`, `Min`, `Max`, `Difference`, `Screen`, `Divide`, `Average`) between two video sources with independent gain, offset, and clamping.
- **Tauri Native Media Stream Asset Manager**: Dedicated desktop file management (`fileAssetManager.ts`) utilizing Tauri's `convertFileSrc` to preserve persistent local file paths and automatically rehydrate video, audio, and image streams across project sessions without browser sandbox restrictions.

## [0.4.0] - 2026-06-02

### Added
- **Hybrid MIDI Overlays System**: Implemented dynamic inline fader overlay learn jacks (`🔌`). They slide/fade into view when mapping mode is active and automatically hide when not in use to keep VJ rack screens clutter-free.
- **Universal Browse & Learn Modal**: Custom split grid inside the MIDI Modal. The left side allows browsing Layer -> Module -> Parameter dynamically; the right side supports direct **Hardware Learn** and a custom **Manual Mapping Sheet** (OMNI/discrete channels, CC index, Note Key codes) for mapping without physical hardware.
- **MIDI Input Modulator Module**: A full modulator module supporting note outputs, velocity outputs, CC outputs, gates, and rhythmic clock sync triggers based on clock divisions (1/4, 1/8, 1/16, 1/32).
- **Global Sidebar Overlays Toggle**: Placed an explicit `"🔌 OVERLAYS: ON/OFF"` button in the sidebar project controls for quick manual previewing of the inline fader jacks.
- **Persistence Support**: Mapped `midiBindings` directly into the save state logic in `projectPersistence.ts` for exportable patches.

## [0.2.1] - 2026-05-14

### Added
- **ColorNoise Module**: New procedural source generating independent RGB noise. Features include 3D Perlin, Simplex, Ridged, Billow, Worley, and Voronoi modes.
- **Unified Noise Engine**: Refactored all procedural noise to use a shared 3D WGSL engine, enabling true "Evolution" (morphing) over time.

### Fixed
- **Webcam Pipeline Stability**: Resolved `TypeError` when setting `playbackRate` on live `MediaStream` objects.
- **Webcam Source Errors**: Fixed "Empty src attribute" errors by correctly removing attributes during media source disposal.
- **White Noise Artifacts**: Eliminated grid patterns in white noise by switching to screen-space pixel coordinates for randomization.

## [0.2.0] - 2026-05-12

### Added
- **Autoscroll**: Graph area now automatically scrolls when dragging modules or edges to the screen boundary.
- **High-Frequency Signal Path**: Implemented `latestSignals` cache in `SignalDispatcher` to bypass React store delays for modulation.

### Changed
- **S&H Enhancement**: Renamed primary trigger to "Capture" and added "Live/Buff" toggle with smart-triggering.
- **Signal Responsiveness**: Standardized `Renderer` to use engine-direct signals for 1:1 input responsiveness (fixes "dead" rotation inputs).
- **Key-Mapping UI**: Added color-coded status bullets to key assignment dropdowns.

### Fixed
- **Graph Snap-back**: Fixed a critical bug where the view would reset to (0,0) when interacting with modules far from the origin.
- **Port Scaling**: Fixed rotation scaling in `ShapeGenerator` to correctly handle 360-degree modulation from all sources.
- **NodeGraph Crash**: Resolved an "Identifier already declared" error in the graph renderer.
