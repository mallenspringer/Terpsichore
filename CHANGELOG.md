# Changelog

## [0.2.0] - 2026-05-12

### Added
- **Autoscroll**: Graph area now automatically scrolls when dragging modules or edges to the screen boundary.
- **High-Frequency Signal Path**: Implemented `latestSignals` cache in `SignalDispatcher` to bypass React store delays for modulation.

### Changed
- **S&H Enhancement**: Renamed primary trigger to "Capture" and added "Live/Buff" toggle with smart-triggering.
- **Signal Responsiveness**: Standardized `Renderer` to use engine-direct signals for 1:1 input responsiveness (fixes "dead" rotation inputs).
- **Key-Mapping UI**: Added color-coded status bullets to key assignment dropdowns.

### Fixed
- **Graph Snap-back**: Fixed a critical bug where the view would reset to (0,0) when interacting with modules far from the origin.
- **Port Scaling**: Fixed rotation scaling in `ShapeGenerator` to correctly handle 360-degree modulation from all sources.
- **NodeGraph Crash**: Resolved an "Identifier already declared" error in the graph renderer.
