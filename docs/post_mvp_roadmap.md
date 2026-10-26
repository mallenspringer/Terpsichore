# Terpsichore: Post-MVP Roadmap

This document tracks planned features and architectural improvements to be addressed after the initial MVP is stable.

## ✅ Completed Milestones
- **WebGPU Instancing**: Migrated `Spawn` module to high-performance storage-buffer batching.
- **Path Module**: Initial implementation of trajectory-based movement (Physics, Wiggle, Orbit).
- **Stochastic Engine**: 1D Noise modulator with White, Pink, Brownian, and Perlin algorithms.
- **v0.2.0 Architecture**: Implemented High-Frequency Signal Engine (Signal Engine 2.0) for zero-latency modulation.
- **v0.2.0 UX**: Implemented Autoscroll and Transform-aware interaction (focus prevention) for stable graph navigation.
- **New Modules**: Kaleidoscope, Pattern, Logic Gates, and the enhanced dual-mode Sample & Hold.
- **Spectral Splitter**: 5-band frequency analysis with real-time WebGPU visualization and modulation outputs.
- **High-Fidelity Vocal Tracking (v0.3.0)**: Formed F0 pitch tracker (YIN), vowel formant tracker, speech envelope tracker, vocal voice profiles, Butterworth anti-aliased decimation, and LPC formant estimation.
- **Hybrid MIDI Overlays & Mapping (v0.4.0)**: Integrated native WebMIDI API manager, inline fader overlays, manual preset builders, note/velocity/CC handlers, and OMNI/discrete channel mappings.
- **Key-Mixer Compositing Node (Tier 4)**: Multi-input Luma/Chroma keyer with green/blue edge spill suppression, threshold/tolerance controls, and matte outputs.
- **Radial & Jitter Pattern Engine (Tier 4)**: Concentric radial tiling, per-tile incremental rotation, pseudo-random jitter, and dynamic CV inputs.
- **Video Math (Tier 4)**: Algebraic texture processor (Add, Subtract, Multiply, Min, Max, Difference, Screen, Divide, Average) with per-input gain and output clamping.
- **Dedicated UV Displacement Module (`UVDisplace`)**: Standalone coordinate domain displacement warp with Cartesian (R/G), Radial, and Luma refraction modes, Clamp/Wrap/Mirror edge handling, and dynamic CV modulation.
- **Dedicated Audio to CV Converter (`AudioToCV`)**: Real-time amplitude-to-modulation utility with Envelope Follower (exponential attack/release), RMS, Peak, and logarithmic dB detection, variable smoothing, bipolar scaling, and threshold gate trigger output.
- **Tauri Native Media Stream Asset Manager (Tier 4)**: Persistent desktop project media rehydration via `convertFileSrc` and automatic web browser fallback.

---

## 🎯 Immediate Execution Sequence

Before adding more video synthesis effects, the development sequence is prioritized as follows:

1. **Quality of Life (QOL) & Non-Effect Features**:
   - **Rendered Video Pop-out**: External browser pop-out window for output display / secondary projector.
   - **Desktop Display Device Parity**: Infrastructure notes for Tauri desktop app to preassign outputs to specific physical monitors and (eventually) route outputs across multiple displays.
2. **Particle & Background Modules**:
   - Dedicated particle system emitters, vector field deflectors, and procedural generative background modules.
3. **Audio Visualizer Rework**:
   - Overhaul basic audio visualizers (Oscilloscope, SpectralSplitter, etc.) for deeper visual richness and responsive live metering.
4. **Module Picker UX Overhaul**:
   - Upgraded search, categorizing, tagging, and ergonomic drag-and-drop / click-to-place module palette.
5. **Tentative Video Synthesis & Masking Modules**:
   - Incorporate selected tentative masking, wiping, and displacement effects.

---

## 🌊 Transitions & Wipes

*Note: Separated from ongoing modulation effects as these primarily serve channel-to-channel and layer-to-layer transitions.*

- **Gradient / Luma Wipe (Thresholded Stencil Transition)**:
  - **Inputs**: Video A, Video B, Gradient/Luma Mask In, Threshold CV, Softness CV.
  - **Functionality**: Compares mask luminance against a sweeping threshold slider/CV. Pixels above the threshold reveal Video A; pixels below reveal Video B. Configurable edge feathering (from hard razor cuts to smooth organic melts).
  - **Use Case**: Organic transitions driven by procedural noise, video files, or audio transients.

---

## 🧪 Tentative Post-MVP Masking & Map-Driven Effects

A ranked bank of candidate video synthesis modules that utilize secondary textures/masks for spatial, temporal, or tonal modulation:

1. **Rutt-Etra / Scanline Displacer (CRT Heightfield Deflection)**:
   - Interprets mask luminance as a 3D Z-height topographic elevation map.
   - Horizontal or vertical raster lines deflect and warp to emulate vintage analog CRT Rutt-Etra video synthesizers.
2. **Slit-Scan Time Displace (Temporal Buffer Warp)**:
   - Circular GPU ring buffer of recent frames (30–60 frames).
   - Mask brightness selects the sampling delay per pixel (e.g., bright areas show real-time; dark areas show historical frames), creating liquid time smears.
3. **Normal / Emboss Bump Mapper (3D Lighting via Mask)**:
   - Computes spatial derivatives of mask texture to generate normal vectors.
   - Steerable virtual light source shades the primary video with metallic bevels, embossed ridges, or liquid chrome reflections.
4. **Luma / Chroma Slicer (Window Keyer & Iso-Contour Mask)**:
   - Surgical bandpass luminance or hue isolation using `Center` and `Bandwidth` parameters.
   - Isolates specific tonal ranges (e.g. only 45%–55% brightness) to feed downstream feedback, colorization, or keying.
5. **Pixelate / Mosaic Grid Warper (Quantized Mask Gating)**:
   - Quantizes coordinate space into discrete pixelation cells whose size, aspect ratio, or rotation is scaled by the mask.
   - Audio-reactive digital degradation, macro-blocking, and dynamic mosaic dissolves.
6. **Difference / Motion Mask (Temporal Stencil)**:
   - Compares the current frame against a previous frame or a freeze-captured background reference.
   - Automatically isolates moving performers / silhouettes without green screen.
7. **Feedback Deflector / Masked Damper**:
   - Mask controls decay rate and vector deflection inside a recursive feedback loop.
   - Prevents feedback loops from blowing out while sculpting directed energy pathways.
8. **Polar / Radial Kaleidoscope Masker**:
   - Mask modulates wedge angles, sector counts, and rotation centers across polar coordinate space.
9. **Halftone / Dither Screen Modulator**:
   - Compares video luminance against procedural or bitmap dither screens (Bayer, dot matrix, stochastic).
   - Stylized 1-bit / CMYK comic-book print aesthetics with moiré interference controls.
10. **Edge Glow / Contour Stencil (Sobel/Laplacian Wireframe)**:
    - Extracts high-contrast boundaries from the mask texture as glowing neon vector outlines.

---

## 🖥️ Architecture & Display Parity Notes (Desktop vs. Browser)

### Rendered Output Routing & Multi-Display Parity
- **Browser-Based Version**:
  - Implements a detached pop-out window via `window.open` streaming the rendered canvas at 60fps.
  - User can drag the detached window to any external monitor or projector and trigger native Fullscreen (`F11` or double-click / button).
- **Desktop (Tauri) App Parity Roadmap**:
  - In the native desktop build, utilize Tauri's multi-window and monitor query APIs (`available_monitors()`, `primary_monitor()`).
  - Add UI configuration allowing users to preassign the output window directly to a specific physical display device (e.g. "Display 2 (HDMI - 1920x1080) - Borderless Fullscreen").
  - Post-MVP extension: Support multi-display tiling or distinct output feeds assigned to separate physical displays simultaneously.

---

## 🎛️ Master Performance & Quick-Map Deck (Replacing Foundational Panel)

*Note: Deprecated the legacy, layer-bound Foundational Panel in favor of a true workspace-wide live performance deck.*

- **Workspace-Level Master Controls**:
  - **Master A/B Crossfader**: Smooth hardware-style DJ/VJ crossfader between Layer 1 (Bus A) and Layer 2 (Bus B) or selectable sub-mix groups.
  - **Global Dimmer & Instant Blackout**: Master level slider ($0.0 \dots 1.0$) with an instant blackout tap button for live drops and stage transitions.
  - **Master Clock & Tap Tempo**: Global BPM engine with musical beat-sync subdivision clock triggers (1/1, 1/2, 1/4, 1/8, 1/16, triplets) for modulating LFOs, step sequencers, and effect intervals.
  - **Master Audio Mute**: Global emergency mute toggle.
- **Custom Macro / Pinned Quick-Map Deck**:
  - **8 Assignable Macro Controls**: Ability to right-click *any* parameter in *any* module (e.g. UV Offset, Feedback Decay, Cutoff, Layer Opacity) and choose "Assign to Macro 1–8" or "Pin to Master Deck".
  - **1-Click MIDI & OSC Learn**: Bind master crossfader, blackout, master dimmer, and the 8 macro knobs to physical hardware controllers in seconds without navigating nested node racks during a live show.
- **Ergonomic Dock Layout**:
  - Collapsible horizontal bottom dock or pinned top header that maximizes screen real estate while keeping critical live controls visible at all times.

---

## 🚀 Existing Feature Backlog

### 1. Advanced Motion & Pathing
- **Physics Engine**: Add mass, gravity, buoyancy, and friction to spawned objects.
- **Attractors/Repellers**: Modules that influence the movement of all objects on a layer based on spatial coordinates.

### 2. Effects Modules
- **Eternal Zoom**: A procedural noise effect that cross-fades octaves during scale changes to create an illusion of infinite inward or outward motion.
- **Complex and Compound Symmetry**: Advanced tiling and mirroring modules (Kaleidoscopes, Mandalas, and multi-axis reflections).
- **Outliner**: Stylized edge detection that creates "slabby" or bold outlines at contrast boundaries.
- **Posterizer**: Color bit-crushing to emulate the stepped-gradient aesthetic of vintage 90s digital video effects.

### 3. UI/UX Polishing
- **Signal Meters**: Dedicated visualizers for every CV input/output in the patchbay.
- **Mini-Maps**: A "Birds-eye" view for large node graphs.
- **Module Presets**: Ability to save and load specific module configurations.

---

## 🏗️ Structural Revisions & Refactoring

### 1. Performance & Rendering
- **Compute Shaders**: Move particle physics and lifecycle management to GPU Compute shaders to free up the CPU.
- **Texture Management**: Implement Texture Arrays/Atlases to support unique textures per instance.

### 2. Signal Engine Architecture
- **Module Registry**: Decentralize the `SignalDispatcher` by moving compilation logic into individual module definitions.
- **Topological Sorting**: Implement a robust DAG sorting algorithm to ensure zero-latency signal flow in complex chains.
- **Trajectory Signal Type**: Formally define a "Recipe-based" signal type for passing complex functions between modules.

### 3. State & Persistence
- **Undo/Redo**: Implement a robust history system for node connections and parameter changes.
- **Cloud Sync**: Optional backend for saving and sharing patches.
