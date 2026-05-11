import { useEngineStore } from '../state/store';

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
  };

  // 2. Gather UI Layouts
  let layouts = {};
  try {
    layouts = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
  } catch (e) {
    console.error("Failed to parse layouts for export", e);
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
      layouts
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

    // 1. Hydrate Store
    useEngineStore.getState().loadProject(project.engine);

    // 2. Hydrate Layouts
    if (project.ui.layouts) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(project.ui.layouts));
    }

    // Force a reload of the layout for the active layer by briefly clearing and resetting or similar?
    // Actually, setting the activeLayerId in loadProject should trigger NodeGraph to re-mount/re-effect.
    
    return project.metadata;
  } catch (err) {
    console.error("Import failed:", err);
    throw err;
  }
}
