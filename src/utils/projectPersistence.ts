import { useEngineStore } from '../state/store';
import { rehydrateProjectMedia } from './fileAssetManager';
import { createDefaultSource, createDefaultEffect, createDefaultModulator, isKnownEffectType, isKnownSourceType } from '../state/moduleFactory';

const LAYOUT_KEY = 'terp_node_layout';
const BANK_CONFIG_KEY = 'terp_bank_config';
const AUTOSAVE_KEY = 'terp_autosave_recovery';

export interface ProjectMetadata {
  version: string;
  schemaVersion: number;
  type: 'project' | 'template';
  name: string;
  author: string;
  createdAt: string;
  modifiedAt: string;
  description?: string;
  appVersion?: string;
  tags?: string[];
}

export interface TerpProject {
  metadata: ProjectMetadata;
  engine: {
    layers: Record<string, any>;
    layerOrder: string[];
    resolution: { width: number; height: number };
    globalAudioMuted: boolean;
    interLayerEdges: any[];
    projectName: string;
    authorName: string;
    midiBindings: any[];
    sensorSystem?: any;
  };
  ui: {
    layouts: Record<string, any>;
    bankConfig?: any;
  };
}

// In-memory handle for File System Access API (Chromium / Desktop Web)
let activeFileHandle: any = null;

export function getActiveFileHandle(): any {
  return activeFileHandle;
}

export function setActiveFileHandle(handle: any) {
  activeFileHandle = handle;
}

/**
 * Reconciles and migrates any raw project data.
 * - Guarantees missing properties on existing modules are filled with current factory defaults.
 * - Safely retains unknown future modules so they don't break the graph or get lost.
 * - Handles template vs project semantics.
 */
export function reconcileProject(rawData: any): { project: TerpProject; isTemplate: boolean } {
  const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid project file: expected a JSON object.');
  }

  // 1. Metadata Normalization & Migration
  const rawMeta = data.metadata || {};
  const isTemplate = rawMeta.type === 'template';
  const rawEngine = data.engine || data; // backward compatibility for legacy format
  const rawName = rawMeta.name || rawEngine.projectName || 'Untitled Project';

  const metadata: ProjectMetadata = {
    version: '2.0',
    schemaVersion: 2,
    type: isTemplate ? 'template' : 'project',
    name: isTemplate ? `${rawName} Copy` : rawName,
    author: rawMeta.author || rawEngine.authorName || 'User',
    createdAt: isTemplate ? new Date().toISOString() : (rawMeta.createdAt || new Date().toISOString()),
    modifiedAt: new Date().toISOString(),
    description: rawMeta.description || '',
    appVersion: '0.3.0',
    tags: Array.isArray(rawMeta.tags) ? rawMeta.tags : []
  };

  // 2. Engine Layers Reconciliation
  const rawLayers = rawEngine.layers || {};
  const reconciledLayers: Record<string, any> = {};

  const layerOrder: string[] = Array.isArray(rawEngine.layerOrder)
    ? rawEngine.layerOrder.filter((id: string) => typeof id === 'string')
    : Object.keys(rawLayers);

  Object.entries(rawLayers).forEach(([layerId, rawLayer]: [string, any]) => {
    if (!rawLayer || typeof rawLayer !== 'object') return;

    // A. Reconcile Source
    let reconciledSource = rawLayer.source;
    if (reconciledSource && typeof reconciledSource === 'object' && reconciledSource.type) {
      if (isKnownSourceType(reconciledSource.type)) {
        const defSource = createDefaultSource(reconciledSource.type);
        reconciledSource = { ...defSource, ...reconciledSource };
      } else {
        // Unknown source type: preserve parameters and tag
        reconciledSource = { ...reconciledSource, _unknownModule: true };
      }
    } else {
      reconciledSource = { type: 'None' };
    }

    // B. Reconcile Effects
    const rawEffects: any[] = Array.isArray(rawLayer.effects) ? rawLayer.effects : [];
    const reconciledEffects = rawEffects.map(rawEff => {
      if (!rawEff || typeof rawEff !== 'object' || !rawEff.type) return rawEff;
      const id = rawEff.id || `fx_${Math.random().toString(36).slice(2, 8)}`;
      if (isKnownEffectType(rawEff.type)) {
        const defEff = createDefaultEffect(rawEff.type, id);
        return { ...defEff, ...rawEff };
      }
      // Unknown effect: keep raw parameters and tag so it can be preserved and safely bypassed
      return { ...rawEff, id, _unknownModule: true };
    });

    // C. Reconcile Modulators
    const rawMods: Record<string, any> = rawLayer.modulators || {};
    const reconciledMods: Record<string, any> = {};
    Object.entries(rawMods).forEach(([modId, rawMod]) => {
      if (rawMod && typeof rawMod === 'object' && rawMod.type) {
        const defMod = createDefaultModulator(rawMod.type);
        reconciledMods[modId] = { ...defMod, ...rawMod };
      } else {
        reconciledMods[modId] = rawMod;
      }
    });

    // D. Graph & Signals
    const graph = rawLayer.graph && typeof rawLayer.graph === 'object'
      ? {
          nodes: Array.isArray(rawLayer.graph.nodes) ? rawLayer.graph.nodes : [],
          edges: Array.isArray(rawLayer.graph.edges) ? rawLayer.graph.edges : [],
          disconnectedPorts: Array.isArray(rawLayer.graph.disconnectedPorts) ? rawLayer.graph.disconnectedPorts : []
        }
      : { nodes: [], edges: [], disconnectedPorts: [] };

    reconciledLayers[layerId] = {
      ...rawLayer,
      id: layerId,
      name: rawLayer.name || `Layer ${layerId}`,
      source: reconciledSource,
      effects: reconciledEffects,
      modulators: reconciledMods,
      graph,
      signals: rawLayer.signals || {},
      inputSettings: rawLayer.inputSettings || {},
      opacity: typeof rawLayer.opacity === 'number' ? rawLayer.opacity : 1.0,
      blendMode: rawLayer.blendMode || 'normal',
    };
  });

  // Ensure at least one valid layer exists
  if (layerOrder.length === 0 || Object.keys(reconciledLayers).length === 0) {
    const defaultLayerId = 'layer_initial';
    layerOrder.push(defaultLayerId);
    reconciledLayers[defaultLayerId] = {
      id: defaultLayerId,
      name: 'Layer 1',
      source: { type: 'None' },
      effects: [],
      modulators: {},
      opacity: 1.0,
      blendMode: 'normal',
      graph: { nodes: [], edges: [], disconnectedPorts: [] },
      signals: {},
      inputSettings: {}
    };
  }

  const engine = {
    layers: reconciledLayers,
    layerOrder,
    resolution: rawEngine.resolution || { width: 1920, height: 1080 },
    globalAudioMuted: Boolean(rawEngine.globalAudioMuted),
    interLayerEdges: Array.isArray(rawEngine.interLayerEdges) ? rawEngine.interLayerEdges : [],
    projectName: metadata.name,
    authorName: metadata.author,
    midiBindings: Array.isArray(rawEngine.midiBindings) ? rawEngine.midiBindings : [],
    sensorSystem: rawEngine.sensorSystem || { deviceId: '', enabled: true, sensors: [] }
  };

  const ui = {
    layouts: data.ui?.layouts || {},
    bankConfig: data.ui?.bankConfig || null
  };

  return {
    project: { metadata, engine, ui },
    isTemplate
  };
}

/**
 * Builds the complete TerpProject object from current memory & localStorage.
 */
export function buildCurrentProject(isTemplate = false): TerpProject {
  const state = useEngineStore.getState();
  const name = state.projectName || 'Untitled Project';

  let layouts = {};
  try {
    layouts = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
  } catch (e) {
    console.error('Failed to parse layouts for project serialization:', e);
  }

  let bankConfig = null;
  try {
    const rawBank = localStorage.getItem(BANK_CONFIG_KEY);
    if (rawBank) bankConfig = JSON.parse(rawBank);
  } catch (e) {
    console.error('Failed to parse bank config for project serialization:', e);
  }

  const engine = {
    layers: state.layers,
    layerOrder: state.layerOrder,
    resolution: state.resolution,
    globalAudioMuted: state.globalAudioMuted,
    interLayerEdges: state.interLayerEdges,
    projectName: state.projectName,
    authorName: state.authorName,
    midiBindings: state.midiBindings,
    sensorSystem: state.sensorSystem,
  };

  return {
    metadata: {
      version: '2.0',
      schemaVersion: 2,
      type: isTemplate ? 'template' : 'project',
      name: name,
      author: state.authorName || 'User',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      appVersion: '0.3.0',
    },
    engine,
    ui: {
      layouts,
      bankConfig
    }
  };
}

export interface SaveProjectOptions {
  forceSaveAs?: boolean;
  isTemplate?: boolean;
}

/**
 * Saves the project.
 * Uses File System Access API (when supported) for direct save/overwrite,
 * or falls back to standard download dialogs in older browsers.
 */
export async function exportProject(options: SaveProjectOptions = {}): Promise<boolean> {
  const { forceSaveAs = false, isTemplate = false } = options;
  const project = buildCurrentProject(isTemplate);
  const jsonString = JSON.stringify(project, null, 2);
  const ext = isTemplate ? 'terptemplate' : 'terp';
  const sanitizedName = (project.metadata.name || 'untitled').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const defaultFileName = `${sanitizedName}.${ext}`;

  // 1. Direct Overwrite via File System Access API (if existing handle and not Save As)
  if (activeFileHandle && !forceSaveAs && !isTemplate) {
    try {
      const writable = await activeFileHandle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      useEngineStore.getState().markSaved(activeFileHandle.name);
      return true;
    } catch (e) {
      console.warn('Direct overwrite via active file handle failed; falling back to dialog:', e);
      activeFileHandle = null;
    }
  }

  // 2. File System Access API Save Picker (Chrome/Edge/Desktop Chromium)
  if (typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function') {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: defaultFileName,
        types: [
          {
            description: isTemplate ? 'Terpsichore Template (*.terptemplate)' : 'Terpsichore Project (*.terp)',
            accept: {
              'application/json': [`.${ext}`, '.json']
            }
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();

      if (!isTemplate) {
        activeFileHandle = handle;
        useEngineStore.getState().markSaved(handle.name);
      } else {
        useEngineStore.getState().markSaved();
      }
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled picker
        return false;
      }
      console.warn('showSaveFilePicker failed; falling back to anchor download:', err);
    }
  }

  // 3. Fallback: Browser Blob Download Anchor
  try {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    useEngineStore.getState().markSaved(defaultFileName);
    return true;
  } catch (err) {
    console.error('Failed to export project via download fallback:', err);
    throw err;
  }
}

/**
 * Imports and hydrates a Terpsichore project from JSON or File.
 */
export async function importProject(jsonDataOrFile: any): Promise<ProjectMetadata> {
  try {
    let rawContent = jsonDataOrFile;

    if (jsonDataOrFile instanceof File) {
      rawContent = await jsonDataOrFile.text();
    } else if (typeof jsonDataOrFile === 'string') {
      rawContent = jsonDataOrFile;
    }

    const { project, isTemplate } = reconcileProject(rawContent);

    // 1. Rehydrate Media Assets for Desktop
    if (project.engine.layers) {
      project.engine.layers = rehydrateProjectMedia(Object.values(project.engine.layers)).reduce((acc: any, l: any) => {
        acc[l.id] = l;
        return acc;
      }, {});
    }

    // 2. Hydrate Zustand Store
    useEngineStore.getState().loadProject(project.engine);

    // 3. Hydrate UI Layouts
    if (project.ui.layouts) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(project.ui.layouts));
    }

    // 4. Hydrate Bank Config
    if (project.ui.bankConfig) {
      localStorage.setItem(BANK_CONFIG_KEY, JSON.stringify(project.ui.bankConfig));
      window.dispatchEvent(new CustomEvent('terp_bank_config_updated'));
    }

    // If opening a template, clear file handle so Save prompts Save As
    if (isTemplate) {
      activeFileHandle = null;
      useEngineStore.getState().setProjectFilePath(null);
    } else if (jsonDataOrFile instanceof File) {
      useEngineStore.getState().setProjectFilePath(jsonDataOrFile.name);
    }

    // Refresh dirty status to clean
    useEngineStore.getState().setDirty(false);

    return project.metadata;
  } catch (err) {
    console.error('Project import failed:', err);
    throw err;
  }
}

/**
 * Resets state to a new project with unsaved changes confirmation.
 */
export function newProjectWithConfirmation(): boolean {
  const isDirty = useEngineStore.getState().isDirty;
  if (isDirty) {
    const confirm = window.confirm('You have unsaved changes in your current project. Are you sure you want to create a new project?');
    if (!confirm) return false;
  }

  activeFileHandle = null;
  useEngineStore.getState().newProject();
  return true;
}

/**
 * Autosave recovery snapshot management.
 */
export function saveAutosaveSnapshot() {
  try {
    const project = buildCurrentProject(false);
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      timestamp: new Date().toISOString(),
      project
    }));
  } catch (e) {
    console.warn('Autosave snapshot failed:', e);
  }
}

export function getAutosaveSnapshot(): { timestamp: string; project: TerpProject } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAutosaveSnapshot() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {}
}
