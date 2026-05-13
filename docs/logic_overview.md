# Logic Overview & Handoff Guide

This document explains the internal engine architecture of Terpsichore to ensure continuity between different AI agents.

## Core Architectural Principle
Terpsichore uses a **Strictly Decoupled Engine**. 
- **Logic & Signal Flow:** Processed at 60fps in pure TypeScript/Memory.
- **Rendering:** Pulls data directly from logic objects to avoid the overhead of the React lifecycle.
- **UI & Presentation:** React/Zustand act as a "surface" that reflects the state of the engine at a throttled rate (10fps).

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
  - **Single Source of Math:** Handles all signal scaling (Amount), Bipolar conversion, and Smoothing.
- **Handoff Tip:** The Renderer pulls from `getLatestSignals(layerId)` to bypass Store latency. All CV/Modulation math happens here.

### 3. Renderer (`src/renderer/Renderer.ts`)
- **Role:** WebGL/WebGPU visual processor.
- **Logic:** 
  - **Zero-Latency Modulation:** Every frame, it calls `SignalDispatcher.getInstance().getLatestSignals(layer.id)`. 
  - **Value Resolution:** Uses `getEffectiveParam()` to combine the **Base Slider Value** with the **Latest High-Frequency Signal** from the Dispatcher.
  - **Analysis:** Performs GPU-based analysis (Luma/Color) and writes raw data to `latestLumaValues` for the Dispatcher to read.
- **Handoff Tip:** Do NOT rely on `layer.signalValues` from the store for rendering; it is too slow for snappy triggers. Use `getEffectiveParam`.

### 4. Module Synchronization (CPU/GPU)
- **Problem:** Some modules (like Sample & Hold) require both a signal change (CPU) and a texture operation (GPU) simultaneously.
- **Solution:** 
  - The **Dispatcher** detects "Events" (like a rising edge on a trigger).
  - It updates an internal State Map (e.g., `shLiveStates`).
  - The **Renderer** reads these State Maps directly to decide whether to blit a new frame or hold the current buffer.
- **Handoff Tip:** Always check if a new feature needs a shared State Map between the Dispatcher and Renderer to ensure logic/visual sync.

### 4. NodeGraph & PortDefs (`src/components/NodeGraph/`)
- **Role:** UI representation and port metadata.
- **Logic:** Defines which modules can connect to which ports.
- **Handoff Tip:** Always check `portDefs.ts` when adding new signals to ensure IDs match between the UI and the Renderer.

## Testing & Stability

### 1. The Safety Net (`src/state/__tests__/`)
- **Vitest:** The project uses Vitest + jsdom for logic testing.
- **Scope:** All core signal dispatching, inter-layer routing, and graph auto-wiring logic is covered by unit tests.
- **Command:** Run `npm test` to verify the engine's integrity before starting a new feature.

### 2. Store-Driven Graph
- **Event-Driven:** Graph re-wiring is triggered by store actions (`setSource`, `addEffect`), NOT React `useEffect`.
### 2. Selectors
- **Event-Driven:** Graph re-wiring is triggered by store actions (`setSource`, `addEffect`), NOT React `useEffect`.
- **Selectors:** Always use specific Zustand selectors (e.g., `useEngineStore(s => s.layers)`) to prevent global re-render cascades during signal updates.

## UI/UX & Graph Interaction (v0.2.0)

### 1. Transform-Aware Interaction
- **The Challenge:** Browsers get confused by `transform: scale()` on a scrollable container. Clicking elements can trigger a "scroll into view" that snaps the view to (0,0).
- **The Strategy:** 
    - **Prevent Focus:** Use `onPointerDown={e => e.preventDefault()}` on all buttons and tabs within a `ModuleNode`. This stops the browser from acquiring focus and triggering the scroll-into-view logic.
    - **Stable References:** Keep the "Scroll Initialization" effect in `NodeGraph` strictly dependent on `layerId`. Moving nodes should NEVER trigger a scroll reset.

### 2. Smooth Traversal (Autoscroll)
- **Logic:** During an active drag (module or edge), we check the cursor position against the container's bounding rect.
- **Trigger:** A 40px margin from any boundary.
- **Speed:** 15px per update.
- **Synchronization:** When the container scrolls, we adjust the internal `dragStart` offsets in the `ModuleNode` to keep the module visually pinned to the cursor.

### 5. Advanced Sequencer State
- **State Persistence**: The `SignalDispatcher` maintains a `sequencerStates` map to track phase, current step, and last known manual settings.
- **Sync Logic**:
    - **Hz/BPM**: Values are linked in the dispatcher. Changing mode converts the internal `rate` value to maintain timing.
    - **Trigger Overrides**: Trigger inputs (Clock/Reset/Pause) are processed with rising-edge detection and take priority over internal phase logic.
- **Bipolar Mapping**: The engine dynamically transforms the internal [0, 1] step values to [-1, 1] on a per-step or global basis before outputting to the signal bus.

## UI Standards (v0.2.1)
- **High-Density Layout**: Modular interfaces (like the Step Sequencer) utilize a "Console-Strip" aesthetic:
    - Stacked jacks and toggles to maximize horizontal space.
    - Standardized 10px LCD-style numerical readouts.
    - Double-click-to-reset on all critical parameters (Knobs, Sliders).
    - Label font color: `#aaa` for standard input banks.
