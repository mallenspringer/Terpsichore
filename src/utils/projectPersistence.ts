import { useEngineStore } from '../state/store';
import { rehydrateProjectMedia } from './fileAssetManager';

const LAYOUT_KEY = 'terp_node_layout';

export interface ProjectMetadata {
  version: string;
  type: 'project' | 'template';
  name: string;
  author: string;
  createdAt: string;
  modifiedAt: string;
  description?: string;
}

export function exportProject() {
  const state = useEngineStore.getState();
  const name = state.projectName || 'Untitled Project';
  
  // 1. Gather Engine State
  const engine = {
    layers: state.layers,
    layerOrder: state.layerOrder,
    resolution: state.resolution,
    globalAudioMuted: state.globalAudioMuted,
    interLayerEdges: state.interLayerEdges,
    projectName: state.projectName,
    authorName: state.authorName,
    midiBindings: state.midiBindings,
  };

  // 2. Gather UI Layouts and Bank Config
  let layouts = {};
  try {
    layouts = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
  } catch (e) {
    console.error("Failed to parse layouts for export", e);
  }

  let bankConfig = null;
  try {
    const rawBank = localStorage.getItem('terp_bank_config');
    if (rawBank) bankConfig = JSON.parse(rawBank);
  } catch (e) {
    console.error("Failed to parse bank config for export", e);
  }

  // 3. Construct Project Object
  const project = {
    metadata: {
      version: "1.0",
      type: "project",
      name: name,
      author: state.authorName || "User",
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    } as ProjectMetadata,
    engine,
    ui: {
      layouts,
      bankConfig
    }
  };

  // 4. Download
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.terp`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function importProject(jsonData: any) {
  try {
    const project = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

    if (!project.engine || !project.ui || !project.metadata) {
      throw new Error("Invalid Terpsichore project file structure.");
    }

    // 1. Rehydrate Media Assets for Desktop
    if (project.engine.layers) {
      project.engine.layers = rehydrateProjectMedia(project.engine.layers);
    }

    // 2. Hydrate Store
    useEngineStore.getState().loadProject(project.engine);

    // 3. Hydrate Layouts
    if (project.ui.layouts) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(project.ui.layouts));
    }

    // 4. Hydrate Bank Config
    if (project.ui.bankConfig) {
      localStorage.setItem('terp_bank_config', JSON.stringify(project.ui.bankConfig));
      window.dispatchEvent(new CustomEvent('terp_bank_config_updated'));
    }

    // Force a reload of the layout for the active layer by briefly clearing and resetting or similar?
    // Actually, setting the activeLayerId in loadProject should trigger NodeGraph to re-mount/re-effect.
    
    return project.metadata;
  } catch (err) {
    console.error("Import failed:", err);
    throw err;
  }
}
