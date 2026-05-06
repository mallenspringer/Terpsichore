# Terpsichore: Post-MVP Roadmap

This document tracks planned features and architectural improvements to be addressed after the initial MVP is stable.

## 🚀 New Features

### 1. Advanced Motion & Pathing
- **Path Module**: A dedicated trajectory generator for complex movement (Lissajous, Bezier, etc.).
- **Physics Engine**: Add mass, gravity, buoyancy, and friction to spawned objects.
- **Attractors/Repellers**: Modules that influence the movement of all objects on a layer based on spatial coordinates.

### 2. Enhanced Signal Processing
- **MIDI Integration**: Support for MIDI clock, notes, and CC for modulation.
- **Spectral Analysis**: Deeper audio analysis (FFT) for frequency-specific modulation.
- **Logic Gates**: AND, OR, XOR modules for trigger-based patch logic.

### 3. UI/UX Polishing
- **Signal Meters**: Dedicated visualizers for every CV input/output in the patchbay.
- **Mini-Maps**: A "Birds-eye" view for large node graphs.
- **Module Presets**: Ability to save and load specific module configurations.

---

## 🏗️ Structural Revisions & Refactoring

### 1. Performance & Rendering
- **WebGPU Instancing**: Migrate the `Spawn` module to use instanced draw calls for rendering thousands of objects.
- **Compute Shaders**: Move particle physics and lifecycle management to GPU Compute shaders to free up the CPU.
- **Texture Management**: Implement Texture Arrays/Atlases to support unique textures per instance.

### 2. Signal Engine Architecture
- **Module Registry**: Decentralize the `SignalDispatcher` by moving compilation logic into individual module definitions.
- **Topological Sorting**: Implement a robust DAG sorting algorithm to ensure zero-latency signal flow in complex chains.
- **Trajectory Signal Type**: Formally define a "Recipe-based" signal type for passing complex functions between modules.

### 3. State & Persistence
- **Undo/Redo**: Implement a robust history system for node connections and parameter changes.
- **Cloud Sync**: Optional backend for saving and sharing patches.
