# Handover Prompt for Signal Dispatcher Implementation

Copy and paste the text below into your new session with the 3.1 Pro model to continue work on the Logic Layer.

---

"I am working on **Terpsichore**, a WebGPU-based modular media engine. We have a stable playback engine and a centralized **Signal Dispatcher** that handles all modulation math.

Your mission is to:
1. Extend the node graph with advanced processing modules (e.g., ADSR Envelopes, Multi-stage LFOs).
2. Ensure the **Renderer** remains lean by offloading all logic to the Dispatcher.
3. Optimize the **WebGPU Buffer Pool** in `Renderer.ts` to support high-count feedback loops.

Refer to `docs/logic_overview.md` for the current 'Brain vs Muscle' architecture and `docs/signal_testing_suite.md` for verification steps."
