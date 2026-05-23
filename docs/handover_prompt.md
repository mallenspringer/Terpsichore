# Handover Prompt for Terpsichore (v0.3.0)

Copy and paste the text below into your new session to continue work on the project.

---

"I am working on **Terpsichore**, a high-performance modular VJ engine built with React, Zustand, and WebGPU. We have just successfully implemented, tuned, and validated the **High-Fidelity Audio Reactivity, Vocal Tracking, & Audio Gating (v0.3.0)** systems.

**Current Architecture:**
1. **The Brain (Signal Engine 2.0)**: Centralized `SignalDispatcher` using a **High-Frequency Bypass**. It maintains a `latestSignals` cache that feeds the WebGPU Renderer directly at 60fps, bypassing React store render latency.
2. **WebGPU Renderer**: High-performance rendering pipeline consuming high-frequency CV/modulation signals. We've implemented a robust 4-Channel VideoMixer engine supporting standard blending modes (Add, Multiply, Screen, Normal) with manual alpha control and dynamic unipolar/bipolar signal inversion parameters.
3. **Physical DOM-Based Edge Routing**: Overhauled edge rendering in `NodeGraph.tsx` to query real-time physical DOM coordinates relative to the graph canvas inner container. If accordions or subgroups are collapsed, the router automatically snaps and bends wires directly onto folded accordion headers (`data-group-header`), preserving coordinates smoothly. Expanded/collapsed states are persisted across sessions.
4. **Graph Instantiation Safety**: Source modules dragged into the graph as active effects (such as `ImageFile` and `ColorNoise`) are properly resolved via `createDefaultEffect` in `moduleFactory.ts` without falling back to feedback placeholders.

**Audio Reactivity Engine (v0.3.0):**
1. **Discrete Audio Gate DSP**: Implements real-time noise suppression with a dual-analyzer architecture. Uses a dedicated **inputAnalyzer** (pre-gate) to calculate threshold crossing and drive the vertical dB meter, and a fast **10ms attack constant** on a custom Web Audio `gateGain` node. 
2. **VU Ballistics Integration**: Integrated an Exponential Moving Average (EMA) low-pass filter ($\alpha = 0.15$) to smooth the calculated RMS power. This completely eliminates low-frequency phase-drift beating on steady vocal notes, delivering a rock-solid, flicker-free VU display and stable gate threshold.
3. **YIN Pitch Detector**: Zero-latency autocorrelation YIN pitch detection, computing Cumulative Mean Normalized Difference, parabolic interpolation for sub-sample resolution, and pitch confidence thresholds.
4. **4th-Order Butterworth Anti-Aliasing**: Built a custom streaming Biquad class and cascaded two stages in series with Q-factors of **0.5412** and **1.3066** (24 dB/octave slope) to filter out all sibilants and high-frequency overtones before decimation. Downsampling uses exact decimation to yield a clean, alias-free baseband.
5. **Order-7 Vocal Formant Tracker**: Upgraded the LPC estimator to **order 7** (3 complex conjugate pole pairs + 1 real glottal pole) and relaxed pre-emphasis to **0.3** to fully preserve low-frequency F1 formant energy. Widen frequency floor to **150 Hz** and bandwidth ceiling to **1200 Hz** to cure the 'F1 Formant Shift' and prevent deep vowel censorship.
6. **Voice Profile Presets**: Implemented a premium drop-down selector directly on the rack UI to scale unipolar linear mapping boundaries:
   * *Universal* (F1: 250-950 Hz, F2: 600-2300 Hz)
   * *Low Baritone/Bass* (F1: 200-800 Hz, F2: 500-1800 Hz)
   * *Tenor/Contralto/Alto* (F1: 250-1000 Hz, F2: 600-2100 Hz)
   * *Mezzo Soprano* (F1: 300-1200 Hz, F2: 700-2500 Hz)

All DSP algorithms pass 100% of our Vitest suite, and strict TypeScript compilation (`tsc --noEmit`) runs completely silently.

**Next Mission:**
Vocal formants (F1/F2) and pitch are fully calibrated and responsive. Our next step is to manually test the Spoken Word Visualizer routing bay, configure multi-channel routing triggers, and map these calibrated vocal coordinates to live WebGPU visual variables (like color morphing, feedback loops, particles, and physics generators)."
