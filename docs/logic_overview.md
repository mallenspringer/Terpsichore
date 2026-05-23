# Logic Overview & Handoff Guide

This document explains the internal engine architecture of Terpsichore to ensure continuity between different AI agents.

## Core Architectural Principle
Terpsichore uses a **Strictly Decoupled Engine**. 
- **Logic & Signal Flow:** Processed at 60fps in pure TypeScript/Memory.
- **Rendering:** Pulls data directly from logic objects to avoid the overhead of the React lifecycle.
- **UI & Presentation:** React/Zustand act as a "surface" that reflects the state of the engine at a throttled rate (10fps).

---

## Key Components

### 1. AudioEngine (`src/state/AudioEngine.ts`)
- **Role:** Singleton manager for the Web Audio API.
- **Logic:** Manages `AnalyserNode` instances per layer. Calculates rolling peak volume for sources.
- **Interface:** `getPeakVolume(layerId)` provides a 0.0–1.0 value used by the Dispatcher.

### 2. SignalDispatcher (`src/state/SignalDispatcher.ts`)
- **Role:** The "Heartbeat" and JIT Compiler.
- **Logic:**
  - **The High-Frequency Path (v0.2.0):** Maintains a `latestSignals` record that updates every single frame. This is a "hot" cache designed for the Renderer.
  - **The UI Path (Throttled):** Commits signal values to the Zustand store (`layer.signalValues`) at a throttled rate (~15-20fps) to keep the React UI responsive.
  - **2-Pass Execution:**
    - **Pass 1 (Fixed):** Populates `latestSignals` from Sources (e.g., `audio_out`), Modulators (e.g., LFO `value`), and Inter-layer inputs.
    - **Pass 2 (Dynamic):** Executes the JIT-compiled pipeline of edges to propagate signals through the graph.
  - **Single Source of Math**: Handles all signal scaling (Amount), Bipolar conversion, and Inversion options.
    - **Inversion Math**: Inversion negates the modulated offset (`processedValue = -processedValue`). For a unipolar signal ($0.0 \to 1.0$) with invert enabled, setting a parameter's base slider value to $1.0$ (e.g. Alpha) scales the signal addition to $1.0 + (-modVal)$, causing the parameter's opacity/strength to cleanly decrease from $1.0$ to $0.0$ as the source modulator rises from $0.0$ to $1.0$.
- **Handoff Tip:** The Renderer pulls from `getLatestSignals(layerId)` to bypass Store latency. All CV/Modulation math happens here.

### 3. Renderer (`src/renderer/Renderer.ts`)
- **Role:** WebGL/WebGPU visual processor.
- **Logic:** 
  - **Zero-Latency Modulation:** Every frame, it calls `SignalDispatcher.getInstance().getLatestSignals(layer.id)`. 
  - **Value Resolution:** Uses `getEffectiveParam()` to combine the **Base Slider Value** with the **Latest High-Frequency Signal** from the Dispatcher.
  - **Analysis:** Performs GPU-based analysis (Luma/Color) and writes raw data to `latestLumaValues` for the Dispatcher to read.
  - **Video Mixer Engine**: Incorporates a 4-channel composition shader supporting normal, add, screen, and multiply pre-multiplied blend modes. Connects layers via a transparent black `blankTexture` fallback for inactive lines.
- **Handoff Tip:** Do NOT rely on `layer.signalValues` from the store for rendering; it is too slow for snappy triggers. Use `getEffectiveParam`.

### 4. Module Synchronization (CPU/GPU)
- **Problem:** Some modules (like Sample & Hold) require both a signal change (CPU) and a texture operation (GPU) simultaneously.
- **Solution:** 
  - The **Dispatcher** detects "Events" (like a rising edge on a trigger).
  - It updates an internal State Map (e.g., `shLiveStates`).
  - The **Renderer** reads these State Maps directly to decide whether to blit a new frame or hold the current buffer.
- **Handoff Tip:** Always check if a new feature needs a shared State Map between the Dispatcher and Renderer to ensure logic/visual sync.

---

## UI/UX & Graph Interaction

### 1. Transform-Aware Interaction
- **The Challenge:** Browsers get confused by `transform: scale()` on a scrollable container. Clicking elements can trigger a "scroll into view" that snaps the view to (0,0).
- **Prevent Focus:** Use `onPointerDown={e => e.preventDefault()}` on all buttons and tabs within a `ModuleNode`. This stops the browser from acquiring focus and triggering the scroll-into-view logic.
- **Stable References:** Keep the "Scroll Initialization" effect in `NodeGraph` strictly dependent on `layerId`. Moving nodes should NEVER trigger a scroll reset.

### 2. Smooth Traversal (Autoscroll)
- **Logic:** During an active drag (module or edge), we check the cursor position against the container's bounding rect.
- **Trigger:** A 40px margin from any boundary.
- **Speed:** 15px per update.
- **Synchronization:** When the container scrolls, we adjust the internal `dragStart` offsets in the `ModuleNode` to keep the module visually pinned to the cursor.

### 3. Physical DOM-Based Edge Routing (v0.2.2)
- **The Challenge:** Statically calculated edge coordinates fail when sub-panels or accordions (like the VideoMixer parameters) collapse or expand.
- **The Solution:** 
  - **Dynamic Bounding Boxes:** `getPortCenter` in `NodeGraph.tsx` queries the physical DOM element using data attributes (`data-node-id` and `data-port-id`). It fetches the bounding rectangle of the `.port-dot` element relative to the inner graph container and scales it by the active `zoom` factor.
  - **Accordion Subgroup Snapping:** If a subgroup parameter is collapsed, its jack element is unmounted. The engine dynamically locates the subgroup header (`[data-group-header="GroupName"]`) and bends the cable directly onto the header boundary in real time.
  - **Session Layout Persistence:** Expanding or collapsing subgroup panels invokes `onLayoutChange`, immediately reflowing the SVG wires. States are persisted via `expandedGroups` inside the Zustand node UI state and saved directly to `localStorage`.

---

## Testing & Stability

### 1. The Safety Net (`src/state/__tests__/`)
- **Vitest:** The project uses Vitest + jsdom for logic testing.
- **Scope:** All core signal dispatching, inter-layer routing, and graph auto-wiring logic is covered by unit tests.
- **Command:** Run `npm test` to verify the engine's integrity before starting a new feature.

### 2. Store-Driven Graph
- **Event-Driven:** Graph re-wiring is triggered by store actions (`setSource`, `addEffect`), NOT React `useEffect`.
- **Selectors:** Always use specific Zustand selectors (e.g., `useEngineStore(s => s.layers)`) to prevent global re-render cascades during signal updates.
