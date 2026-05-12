# Terpsichore: Post-MVP Roadmap

This document tracks planned features and architectural improvements to be addressed after the initial MVP is stable.

## ✅ Completed Milestones
- **WebGPU Instancing**: Migrated `Spawn` module to high-performance storage-buffer batching.
- **Path Module**: Initial implementation of trajectory-based movement (Physics, Wiggle, Orbit).
- **Stochastic Engine**: 1D Noise modulator with White, Pink, Brownian, and Perlin algorithms.

## 🚀 New Features

### 1. Advanced Motion & Pathing
- **Physics Engine**: Add mass, gravity, buoyancy, and friction to spawned objects.
- **Attractors/Repellers**: Modules that influence the movement of all objects on a layer based on spatial coordinates.

### 2. Enhanced Signal Processing
- **MIDI Integration**: Support for MIDI clock, notes, and CC for modulation.
- **Spectral Analysis**: Deeper audio analysis (FFT) for frequency-specific modulation.
- **Logic Gates**: AND, OR, XOR modules for trigger-based patch logic.

### 3. Effects Modules
- **Pattern Refinements**: 
    - **Radial Mode**: Tiling objects in concentric circles rather than grids.
    - **Per-Tile Rotation**: Staggered rotation where each tile rotates incrementally.
    - **Tile Jitter**: Noise/randomization of tile positions.
    - **UV Distortion Port**: Input for warping tiles using external video signals.
- **Video Math**: A high-level module for combining two or more textures using algebraic operators (Add, Subtract, Multiply, Min/Max) and standard blending modes.
- **Eternal Zoom**: A procedural noise effect that cross-fades octaves during scale changes to create an illusion of infinite inward or outward motion.
- **Complex and Compound Symmetry**: Advanced tiling and mirroring modules (Kaleidoscopes, Mandalas, and multi-axis reflections).
- **Outliner**: Stylized edge detection that creates "slabby" or bold outlines at contrast boundaries.
- **Posterizer**: Color bit-crushing to emulate the stepped-gradient aesthetic of vintage 90s digital video effects.

### 4. Physics & Space
- **Gravity Module**: A dedicated spatial force module that exerts directional pull on objects across the coordinate plane.
- **Physics Engine**: Add mass, gravity, buoyancy, and friction to spawned objects.
- **Attractors/Repellers**: Modules that influence the movement of all objects on a layer based on spatial coordinates.

### 4. 1-Click Audio Visualizers
- **Visualizer Presets**: A bank of "Macro" patches that instantly wire up audio transients to specific visual styles.

### 5. UI/UX Polishing
- **Signal Meters**: Dedicated visualizers for every CV input/output in the patchbay.
- **Mini-Maps**: A "Birds-eye" view for large node graphs.
- **Module Presets**: Ability to save and load specific module configurations.

---

## 🏗️ Structural Revisions & Refactoring

### 1. Performance & Rendering
- **Compute Shaders**: Move particle physics and lifecycle management to GPU Compute shaders to free up the CPU.
- **Texture Management**: Implement Texture Arrays/Atlases to support unique textures per instance.

### 2. Signal Engine Architecture
- **Module Registry**: Decentralize the `SignalDispatcher` by moving compilation logic into individual module definitions.
- **Topological Sorting**: Implement a robust DAG sorting algorithm to ensure zero-latency signal flow in complex chains.
- **Trajectory Signal Type**: Formally define a "Recipe-based" signal type for passing complex functions between modules.

### 3. State & Persistence
- **Undo/Redo**: Implement a robust history system for node connections and parameter changes.
- **Cloud Sync**: Optional backend for saving and sharing patches.
