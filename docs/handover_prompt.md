# Handover Prompt for Terpsichore (v0.2.0)

Copy and paste the text below into your new session to continue work on the project.

---

"I am working on **Terpsichore**, a high-performance modular VJ engine built with React, Zustand, and WebGPU. We have just finalized the **Step Sequencer (v0.2.1)**, which introduced high-density console-style UI standards and advanced bipolar modulation logic.

**Current Architecture:**
1. **The Brain (Signal Engine 2.0)**: Centralized `SignalDispatcher` using a **High-Frequency Bypass**. It maintains a `latestSignals` cache that feeds the Renderer directly, bypassing React store latency.
2. **The Muscle (Renderer)**: WebGPU pipeline consuming high-frequency signals via `getEffectiveParam()`. 
3. **Advanced Sequencing**: JIT-compiled clocking system with linked Hz/BPM modes and per-step bipolar transformations.
4. **Console-Grade UI**: Dense, interactive layouts with standardized meters (10px) and double-click reset behaviors across all modules.

**Active Mission:**
We are shifting focus to the **Audio & Routing Layer**. Our next goals are:
1. **Audio Mixing Overhaul**: Refine the 4-channel VideoMixer and expand its integration with the AudioEngine.
2. **Global Modulation Sync**: Ensure the LFO 'Sync Out' triggers are consistently driving complex patches across all layers.
3. **Audio-Reactive Refinement**: Improve the Analyzer module's integration with the new high-density UI standards.
4. **Session Stability**: Validate project persistence (Save/Load) with the expanded Sequencer state.

Refer to `docs/logic_overview.md` and `docs/modules.md` for architecture details. Use `npm run dev` to start the environment."
