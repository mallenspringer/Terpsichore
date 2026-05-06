import { create } from 'zustand';
import { LayerState, LayerGraph, InterLayerEdge, EngineState, PortSettings } from './types';

interface EngineActions {
  // Global Settings
  setResolution: (width: number, height: number) => void;
  setGlobalAudioMuted: (muted: boolean) => void;

  // Actions
  addLayer: (layer: LayerState) => void;
  updateLayer: (id: string, updates: Partial<LayerState>) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  reorderEffect: (layerId: string, fromIndex: number, toIndex: number) => void;
  updateLayerGraph: (layerId: string, graph: LayerGraph) => void;
  updateLayerSignals: (layerId: string, signals: Record<string, number>) => void;
  updateInputSettings: (layerId: string, portKey: string, updates: Partial<PortSettings>) => void;
  
  // Inter-layer routing
  addInterLayerEdge: (edge: InterLayerEdge) => void;
  removeInterLayerEdge: (id: string) => void;
}

export type StoreState = EngineState & EngineActions & {
  resolution: { width: number; height: number };
  globalAudioMuted: boolean;
  interLayerEdges: InterLayerEdge[];
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

  setResolution: (width: number, height: number) =>
    set(() => ({ resolution: { width, height } })),
  
  setGlobalAudioMuted: (muted: boolean) =>
    set(() => ({ globalAudioMuted: muted })),

  addLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer.id]: layer },
      layerOrder: [...state.layerOrder, layer.id],
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


  addInterLayerEdge: (edge) =>
    set((state) => ({ interLayerEdges: [...state.interLayerEdges, edge] })),

  removeInterLayerEdge: (id) =>
    set((state) => ({
      interLayerEdges: state.interLayerEdges.filter(e => e.id !== id)
    })),
}));
