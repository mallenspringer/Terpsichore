# Handover Prompt for Terpsichore (v0.4.0)

Copy and paste the text below into your new session to continue work on the project.

---

"I am working on **Terpsichore**, a high-performance modular VJ engine built with React, Zustand, and WebGPU. We have just successfully implemented, tuned, and validated the **Hybrid MIDI Mapping & Overlays System (v0.4.0)**, built on top of our **High-Fidelity Audio Reactivity & Vocal Tracking (v0.3.0)** architecture.

**Current Architecture:**
1. **The Brain (Signal Engine 2.0)**: Centralized `SignalDispatcher` utilizing a **High-Frequency Bypass**. It maintains a `latestSignals` cache that feeds the WebGPU Renderer directly at 60fps, bypassing React store render latency.
2. **WebGPU Renderer**: High-performance rendering pipeline consuming high-frequency CV/modulation signals. We've implemented a robust 4-Channel VideoMixer engine supporting standard blending modes (Add, Multiply, Screen, Normal) with manual alpha control and dynamic unipolar/bipolar signal inversion parameters.
3. **Physical DOM-Based Edge Routing**: Overhauled edge rendering in `NodeGraph.tsx` to query real-time physical DOM coordinates relative to the graph canvas inner container. If accordions or subgroups are collapsed, the router automatically snaps and bends wires directly onto folded accordion headers (`data-group-header`), preserving coordinates smoothly. Expanded/collapsed states are persisted across sessions.
4. **Graph Instantiation Safety**: Source modules dragged into the graph as active effects (such as `ImageFile` and `ColorNoise`) are properly resolved via `createDefaultEffect` in `moduleFactory.ts` without falling back to feedback placeholders.

**Vocal Reactivity Engine (v0.3.0):**
1. **Discrete Audio Gate DSP**: Implements real-time noise suppression with a dual-analyzer architecture. Uses a dedicated **inputAnalyzer** (pre-gate) to calculate threshold crossing and drive the vertical dB meter, and a fast **10ms attack constant** on a custom Web Audio `gateGain` node. 
2. **VU Ballistics Integration**: Integrated an Exponential Moving Average (EMA) low-pass filter ($\alpha = 0.15$) to smooth the calculated RMS power. This completely eliminates low-frequency phase-drift beating on steady vocal notes, delivering a rock-solid, flicker-free VU display and stable gate threshold.
3. **YIN Pitch Detector**: Zero-latency autocorrelation YIN pitch detection, computing Cumulative Mean Normalized Difference, parabolic interpolation for sub-sample resolution, and pitch confidence thresholds.
4. **4th-Order Butterworth Anti-Aliasing**: Built a custom streaming Biquad class and cascaded two stages in series with Q-factors of **0.5412** and **1.3066** (24 dB/octave slope) to filter out all sibilants and high-frequency overtones before decimation. Downsampling uses exact decimation to yield a clean, alias-free baseband.
5. **Order-7 Vocal Formant Tracker**: Upgraded the LPC estimator to **order 7** (3 complex conjugate pole pairs + 1 real glottal pole) and relaxed pre-emphasis to **0.3** to fully preserve low-frequency F1 formant energy. Widen frequency floor to **150 Hz** and bandwidth ceiling to **1200 Hz** to cure the 'F1 Formant Shift' and prevent deep vowel censorship.
6. **Voice Profile Presets**: Implemented a premium drop-down selector directly on the rack UI to scale unipolar linear mapping boundaries.

**Hybrid MIDI Overlays & Mapping (v0.4.0):**
1. **Clutter-Free Inline Jacks**: Modulators and effects sliders render inline learn jacks (`🔌`) that dynamically slide/fade into view when mapping mode is active, keeping the modular workspace completely clean during VJ sets.
2. **MIDI Overlays Sync**: Connected the mapping modal's open/close state directly to Zustand's `midiOverlayActive` store flag, triggering overlays automatically on mount, and turning them off on close. Added a manual `"🔌 OVERLAYS: ON/OFF"` preview toggle button in the Sidebar under project settings.
3. **Universal Interactive Learn & Manual Assignment (Tab 3)**:
   - *Left Panel*: Allows dropdown browsing of any canvas parameter (Layer -> Module -> Parameter) including secondary settings like the Shape Generator's Star/Convex/convexity settings or LFO parameters.
   - *Right Panel*: Supports choosing between **Hardware Learn** (immediate wiggler mapping detection) and **Manual Binding** (specifying OMNI/discrete channel indices, CC index, or Note Key code) to configure mappings without physical hardware.
4. **MidiInput Modulator Module**: Generates 5 outputs (`note_out` normalized pitch, `gate_out`, `velocity_out`, `cc_out` mapping CC knobs, and `clock_out` tempo-synced beats derived from clock divisions). Integrated into sidebar module bank lists and persistence saves.

All DSP, modulator, and layout rendering algorithms pass 100% of our Vitest suite. Strict TypeScript compilation (`tsc --noEmit` / `npm run build`) runs cleanly.

**Next Mission: Miscellaneous Refinements in Visual and Audio Modules**
We want to take a pause on new major subsystem features and focus on refining, tuning, and polishing existing visual and audio modules. Let's start an interactive audit or interview to review which parameters, visualizations, and DSP settings on our modules (such as ShapeGenerator, VideoMixer, SpectralSplitter, Vocal Trackers, or LFO/Noise modulators) we can refine to elevate the performance, responsiveness, and visual styling of Terpsichore."
