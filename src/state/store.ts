import { create } from 'zustand';
import { LayerState, LayerGraph, InterLayerEdge, EngineState, PortSettings, AnySource, AnyEffect } from './types';
import { buildAutoEdges } from './graphUtils';

interface EngineActions {
  // Global Settings
  setResolution: (width: number, height: number) => void;
  setGlobalAudioMuted: (muted: boolean) => void;

  // Actions
  addLayer: (layer: LayerState) => void;
  updateLayer: (id: string, updates: Partial<LayerState>) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  loadProject: (project: any) => void;
  reorderEffect: (layerId: string, fromIndex: number, toIndex: number) => void;
  updateLayerGraph: (layerId: string, graph: LayerGraph) => void;
  updateLayerSignals: (layerId: string, signals: Record<string, number>) => void;
  updateInputSettings: (layerId: string, portKey: string, updates: Partial<PortSettings>) => void;
  
  // High-level mutations with auto-wiring
  setSource: (layerId: string, source: AnySource) => void;
  addEffect: (layerId: string, effect: AnyEffect) => void;
  updateEffect: (layerId: string, effectId: string, updates: Partial<AnyEffect>) => void;
  removeEffect: (layerId: string, effectId: string) => void;
  addModulator: (layerId: string, id: string, mod: any) => void;
  updateModulatorGlobal: (id: string, updates: any) => void;
  removeModulator: (layerId: string, id: string) => void;
  
  // Inter-layer routing
  addInterLayerEdge: (edge: InterLayerEdge) => void;
  removeInterLayerEdge: (id: string) => void;

  // Selection
  setActiveLayerId: (id: string | null) => void;
}

export type StoreState = EngineState & EngineActions & {
  resolution: { width: number; height: number };
  globalAudioMuted: boolean;
  interLayerEdges: InterLayerEdge[];
  isGlobalPaused: boolean;
  globalResetSignal: number;
  projectName: string;
  authorName: string;
  setIsGlobalPaused: (paused: boolean) => void;
  triggerGlobalReset: () => void;
  setProjectName: (name: string) => void;
  setAuthorName: (name: string) => void;
};

export const useEngineStore = create<StoreState>((set) => ({
  layers: {
    'layer_initial': {
      id: 'layer_initial',
      name: 'Layer 1',
      source: { type: 'None' } as any,
      effects: [],
      modulators: {},
      opacity: 1.0,
      blendMode: 'normal',
    }
  },
  layerOrder: ['layer_initial'],
  activeLayerId: 'layer_initial',
  resolution: { width: 1920, height: 1080 },
  globalAudioMuted: false,
  interLayerEdges: [],
  canvasWidth: 1920,
  canvasHeight: 1080,
  isGlobalPaused: false,
  globalResetSignal: 0,
  projectName: 'Untitled Project',
  authorName: 'User',

  setProjectName: (name) => set({ projectName: name }),
  setAuthorName: (name) => set({ authorName: name }),
  setIsGlobalPaused: (paused) => set({ isGlobalPaused: paused }),
  triggerGlobalReset: () => set((state) => ({ globalResetSignal: state.globalResetSignal + 1 })),

  setResolution: (width: number, height: number) =>
    set(() => ({ resolution: { width, height } })),
  
  setGlobalAudioMuted: (muted: boolean) =>
    set(() => ({ globalAudioMuted: muted })),

  addLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer.id]: layer },
      layerOrder: [layer.id, ...state.layerOrder],
    })),
  
  updateLayer: (id, updates) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [id]: { ...state.layers[id], ...updates }
      }
    })),

  removeLayer: (id) =>
    set((state) => {
      const newLayers = { ...state.layers };
      delete newLayers[id];
      return {
        layers: newLayers,
        layerOrder: state.layerOrder.filter(lid => lid !== id),
      };
    }),

  reorderLayer: (fromIndex, toIndex) =>
    set((state) => {
      const newOrder = [...state.layerOrder];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      return { layerOrder: newOrder };
    }),

  loadProject: (project) =>
    set(() => ({
      layers: project.layers,
      layerOrder: project.layerOrder,
      resolution: project.resolution,
      globalAudioMuted: project.globalAudioMuted,
      interLayerEdges: project.interLayerEdges,
      projectName: project.projectName || 'Untitled Project',
      authorName: project.authorName || 'User',
      activeLayerId: project.layerOrder[0] || null,
    })),

  reorderEffect: (layerId, fromIndex, toIndex) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const effects = [...layer.effects];
      const [moved] = effects.splice(fromIndex, 1);
      effects.splice(toIndex, 0, moved);
      return { layers: { ...state.layers, [layerId]: { ...layer, effects } } };
    }),

  updateLayerGraph: (layerId, graph) =>
    set((state) => ({
      layers: { ...state.layers, [layerId]: { ...state.layers[layerId], graph } }
    })),

  updateLayerSignals: (layerId, signals) =>
    set((state) => ({
      layers: { ...state.layers, [layerId]: { ...state.layers[layerId], signalValues: signals } }
    })),
  
  updateInputSettings: (layerId, portKey, updates) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const settings = { ...(layer.inputSettings || {}) };
      settings[portKey] = { ...(settings[portKey] || { amount: 1.0, bipolar: false }), ...updates };
      return { layers: { ...state.layers, [layerId]: { ...layer, inputSettings: settings } } };
    }),

  setSource: (layerId, source) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const nextLayer = { ...layer, source };
      const nextEdges = buildAutoEdges(nextLayer, layer.graph);
      return { 
        layers: { 
          ...state.layers, 
          [layerId]: { ...nextLayer, graph: { ...layer.graph, edges: nextEdges } } 
        } 
      };
    }),

  addEffect: (layerId, effect) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const nextLayer = { ...layer, effects: [...layer.effects, effect] };
      const nextEdges = buildAutoEdges(nextLayer, layer.graph);
      return { 
        layers: { 
          ...state.layers, 
          [layerId]: { ...nextLayer, graph: { ...layer.graph, edges: nextEdges } } 
        } 
      };
    }),
  
  updateEffect: (layerId, effectId, updates) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const effects = layer.effects.map(e => e.id === effectId ? { ...e, ...updates } as AnyEffect : e);
      return { layers: { ...state.layers, [layerId]: { ...layer, effects } } };
    }),

  removeEffect: (layerId, effectId) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const nextLayer = { ...layer, effects: layer.effects.filter(e => e.id !== effectId) };
      const nextEdges = buildAutoEdges(nextLayer, layer.graph);
      return { 
        layers: { 
          ...state.layers, 
          [layerId]: { ...nextLayer, graph: { ...layer.graph, edges: nextEdges } } 
        } 
      };
    }),

  addModulator: (layerId, id, mod) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const nextLayer = { ...layer, modulators: { ...layer.modulators, [id]: mod } };
      const nextEdges = buildAutoEdges(nextLayer, layer.graph);
      return { 
        layers: { 
          ...state.layers, 
          [layerId]: { ...nextLayer, graph: { ...layer.graph, edges: nextEdges } } 
        } 
      };
    }),

  updateModulatorGlobal: (id, updates) =>
    set((state) => {
      const nextLayers = { ...state.layers };
      let changed = false;
      Object.entries(nextLayers).forEach(([layerId, layer]) => {
        if (layer.modulators && layer.modulators[id]) {
          nextLayers[layerId] = {
            ...layer,
            modulators: {
              ...layer.modulators,
              [id]: { ...layer.modulators[id], ...updates }
            }
          };
          changed = true;
        }
      });
      return changed ? { layers: nextLayers } : {};
    }),

  removeModulator: (layerId, id) =>
    set((state) => {
      const layer = state.layers[layerId];
      if (!layer) return {};
      const nextModulators = { ...layer.modulators };
      delete nextModulators[id];
      const nextLayer = { ...layer, modulators: nextModulators };
      const nextEdges = buildAutoEdges(nextLayer, layer.graph);
      return { 
        layers: { 
          ...state.layers, 
          [layerId]: { ...nextLayer, graph: { ...layer.graph, edges: nextEdges } } 
        } 
      };
    }),


  addInterLayerEdge: (edge) =>
    set((state) => ({ interLayerEdges: [...state.interLayerEdges, edge] })),

  removeInterLayerEdge: (id) =>
    set((state) => ({
      interLayerEdges: state.interLayerEdges.filter(e => e.id !== id)
    })),

  setActiveLayerId: (id) => set({ activeLayerId: id }),
}));
