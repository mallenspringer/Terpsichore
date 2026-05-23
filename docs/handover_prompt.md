# Handover Prompt for Terpsichore (v0.2.2)

Copy and paste the text below into your new session to continue work on the project.

---

"I am working on **Terpsichore**, a high-performance modular VJ engine built with React, Zustand, and WebGPU. We have just completed a major overhaul of the **VideoMixer** module, stabilized the **Node Graph Edge Routing**, and fixed drag-and-drop source-as-effect graph instantiations.

**Current Architecture:**
1. **The Brain (Signal Engine 2.0)**: Centralized `SignalDispatcher` using a **High-Frequency Bypass**. It maintains a `latestSignals` cache that feeds the Renderer directly, bypassing React store latency.
2. **The Muscle (Renderer)**: WebGPU pipeline consuming high-frequency signals. We've implemented a robust 4-Channel VideoMixer engine supporting standard blending modes (Add, Multiply, Screen, Normal) with staggered alpha manual control sliders and dynamic unipolar/bipolar signal inversion parameters.
3. **Physical DOM-Based Edge Router**: We overhauled the edge rendering engine in `NodeGraph.tsx` to query real-time physical DOM coordinates relative to the graph canvas inner container. If accordions or subgroups are collapsed, the router automatically snaps and bends wires directly onto folded accordion headers (`data-group-header`), preserving coordinates smoothly. Expanded/collapsed states are persisted across sessions in `localStorage` (`expandedGroups`).
4. **Graph Instantiation Safety**: Source modules dragged into the graph as active effects (such as `ImageFile` and `ColorNoise`) are properly resolved via `createDefaultEffect` in `moduleFactory.ts` without falling back to `SimpleFeedback` placeholders.
5. **Console-Grade UI**: Dense, interactive layouts with standardized meters, keyboard trigger keys, and double-click reset parameters.

**Active Mission:**
We are shifting focus back to **Audio Features** and **High-Fidelity Vocal Tracking**. Our next goals are:
1. **DSP Class Construction**: Establish pure TypeScript extractor classes inside `src/dsp/` (`EnvelopeFollower`, `YinPitchDetector`, `LpcFormantTracker`, `SpectralTimbreExtractor`) as detailed in the exhaustive blueprint `docs/audio_reactivity_implementation_plan.md`.
2. **Phase 1 Modules**: Build the discrete Speech Envelope Tracker node, routing syllables and speech onsets directly to visual parameters.
3. **Phase 2 Modules**: Build Vocal Pitch and Vowel Formant Trackers mapping vocal phonemes to grid spatial systems.
4. **Verification**: Maintain 100% test coverage using `npx vitest run` and type safety with `npx tsc --noEmit`.

Refer to `docs/logic_overview.md`, `docs/modules.md`, and `docs/audio_reactivity_implementation_plan.md` for architecture details. Use `npm run dev` to start the environment."

