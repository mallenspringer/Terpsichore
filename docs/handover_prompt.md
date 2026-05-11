# Handover Prompt for Terpsichore

Copy and paste the text below into your new session to continue work on the project.

---

"I am working on **Terpsichore**, a high-performance modular VJ engine built with React, Zustand, and WebGPU (Tauri). We just completed a major architecture stabilization refactor.

**Current Architecture:**
1. **The Brain (Signal Engine)**: A centralized `SignalDispatcher` using a **2-pass execution model**. Pass 1 populates 'Fixed' outputs (Sources, Modulators, Inter-layer inputs); Pass 2 executes a JIT-compiled pipeline of edges.
2. **The Muscle (Renderer)**: A lean WebGPU pipeline that reads `signalValues` directly from the layer state without internal logic.
3. **The State Layer**: A Zustand store using **High-performance Selectors** to minimize re-renders. Graph auto-wiring is handled via event-driven store actions (`addEffect`, `setSource`, etc.), NOT `useEffect`.
4. **The Safety Net**: A Vitest suite (using `jsdom`) located in `src/state/__tests__`. All core signal routing and graph mutations are unit-tested.

**Active Mission:**
We are stabilizing the **Inter-Layer Signal Routing** and fixing UI synchronization regressions. Our next goals are:
1. **Fix NodeGraph Sync**: Resolve why `NodeGraph` stays in 'empty' state despite `activeLayerId` being set in the store.
2. **Repair Module Creation**: Fix the "Click-to-Add" feature in `Sidebar.tsx` which currently creates uninteractable module headers.
3. **Clean UI Redundancy**: Remove the duplicate "Layer" section in the bottom foundational bar created during the `App.tsx` refactor.
4. **Validate Pipeline**: Verify signal flow from `Layer Out` -> `InterLayerBus` -> `Layer In` using `[SignalDispatcher] PIPELINE` logs.

Refer to `docs/logic_overview.md` for architecture details. Use `npm run build` to verify types and `npm run dev` to test the UI."
