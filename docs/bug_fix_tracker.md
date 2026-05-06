# Bug & Fix Tracker

This document tracks identified bugs and their verified solutions for agent handoff.

| Bug Description | Proposed / Verified Solution |
| :--- | :--- |
| **Edge Y Plane Offset:** Edges from source modules originate from the wrong vertical position. | **Fix:** Update `getPortCenter` to use dynamic offsets based on port index instead of hardcoded `y + 48`. |
| **Transform2D Modulation Inactive:** Meters show activity but the video size does not change. | **Fix:** Unify port IDs in `portDefs.ts` (`scale_x`) with keys queried in `Renderer.ts` (`scaleX`). |
| **Stuck Value Meters:** Meters keep their last value even after the patch cable is removed. | **Fix:** Reset all `layer.signalValues` to `0.0` at the start of each `SignalDispatcher` frame. |
| **WebGL Crash (locked CommandEncoder):** App crashes when adding non-visual modules like Bipolar. | **Fix:** Filter `layer.effects` in `Renderer.ts` to skip utility nodes before creating GPU RenderPasses. |
| **Broken Auto-Wiring:** The solid "Video Output" line breaks when a Bipolar module is in the rack. | **Fix:** Update `buildAutoEdges` to filter for `video`-type ports when constructing the daisy-chain. |
| **Bipolar Bottoming Out:** Audio peak mapping to Bipolar starts at -1.0 during silence. | **Fix:** Implement signal scaling/attenuation or depth sliders for modulation inputs. |
| **WebGPU Device Loss:** Rendering freezes due to buffer leaks in the render loop. | **Fix:** Implement a persistent `uniformBuffers` Map and use `writeBuffer` instead of recreating buffers. |
| **Double Modulation Math:** Signals jump or move erratically when Bipolar is enabled. | **Fix:** Centralize math in `SignalDispatcher.ts` and ensure `Renderer.ts` only reads final values. |
