# Handover Prompt for Terpsichore (v0.2.0)

Copy and paste the text below into your new session to continue work on the project.

---

"I am working on **Terpsichore**, a high-performance modular VJ engine built with React, Zustand, and WebGPU. We just released **v0.2.0**, which stabilized the engine and graph UX.

**Current Architecture:**
1. **The Brain (Signal Engine 2.0)**: Centralized `SignalDispatcher` using a **High-Frequency Bypass**. It maintains a `latestSignals` cache that feeds the Renderer directly, bypassing React store latency.
2. **The Muscle (Renderer)**: WebGPU pipeline consuming high-frequency signals via `getEffectiveParam()`. It handles complex texture blitting for modules like **Sample & Hold**.
3. **The UX Layer**: A zoomed/scaled Node Graph with **Autoscroll** and **Focus-Prevention** logic to ensure stability in transformed containers.
4. **The Dispatcher**: Uses a 2-pass JIT execution model for zero-latency CV propagation.

**Active Mission:**
We are refining the control system and expanding module interactivity. Our next goals are:
1. **Module Header Key Indicators**: Add visual indicators (colored dots) to module headers to show which key (1-0) is currently triggering/controlling them.
2. **Multi-Assignment Support**: Allow a single module to be triggered by multiple keys (expanding the current 1:1 mapping).
3. **Global Reset Expansion**: Refine the Global Reset signal so it can optionally clear S&H buffers or reset LFO phases across all layers.
4. **Performance Check**: Verify the `latestSignals` cache memory usage over long sessions.

Refer to `docs/logic_overview.md` and `docs/modules.md` for architecture details. Use `npm run dev` to start the environment."
