import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  reconcileProject,
  buildCurrentProject,
  newProjectWithConfirmation,
  saveAutosaveSnapshot,
  getAutosaveSnapshot,
  clearAutosaveSnapshot
} from '../projectPersistence';
import { useEngineStore } from '../../state/store';

vi.mock('../../state/AudioEngine', () => {
  return {
    AudioEngine: {
      getInstance: () => ({
        disconnectNode: vi.fn(),
        unregisterMediaElement: vi.fn()
      })
    }
  };
});

describe('Project Persistence & Auto-Reconciliation System', () => {
  beforeEach(() => {
    localStorage.clear();
    useEngineStore.getState().newProject();
  });

  describe('reconcileProject()', () => {
    it('migrates legacy v1.0 project data to v2.0 schema', () => {
      const legacyProject = {
        metadata: {
          version: '1.0',
          type: 'project',
          name: 'Old Project',
          author: 'Alice',
          createdAt: '2026-01-01T00:00:00Z',
          modifiedAt: '2026-01-01T00:00:00Z'
        },
        engine: {
          layers: {
            layer_1: {
              id: 'layer_1',
              name: 'Layer 1',
              source: { type: 'ShapeGenerator' },
              effects: [
                { id: 'uv_1', type: 'UVDisplace', amount: 0.5 }
              ]
            }
          },
          layerOrder: ['layer_1'],
          resolution: { width: 1280, height: 720 },
          globalAudioMuted: false,
          interLayerEdges: [],
          projectName: 'Old Project',
          authorName: 'Alice'
        },
        ui: {
          layouts: { layer_1: {} }
        }
      };

      const { project, isTemplate } = reconcileProject(legacyProject);

      expect(isTemplate).toBe(false);
      expect(project.metadata.version).toBe('2.0');
      expect(project.metadata.schemaVersion).toBe(2);
      expect(project.metadata.name).toBe('Old Project');

      // Check auto-reconciliation of missing UVDisplace parameters
      const uvEffect = project.engine.layers.layer_1.effects[0];
      expect(uvEffect.type).toBe('UVDisplace');
      expect(uvEffect.amount).toBe(0.5); // Preserves user value
      expect(uvEffect.polarity).toBe('bipolar'); // Injects default
      expect(uvEffect.edgeFalloff).toBe(0.1); // Injects default
      expect(uvEffect.wrapMode).toBe('clamp'); // Injects default
    });

    it('gracefully preserves unknown future modules without corrupting them', () => {
      const futureProject = {
        metadata: { version: '2.0', schemaVersion: 2, type: 'project', name: 'Future' },
        engine: {
          layers: {
            layer_1: {
              id: 'layer_1',
              name: 'Layer 1',
              source: { type: 'QuantumHologram', customResolution: 4096 },
              effects: [
                { id: 'future_fx_1', type: 'HolographicInterferometer', beamCount: 16, wavelength: 532 }
              ],
              graph: {
                nodes: [{ id: 'future_fx_1' }],
                edges: [{ id: 'e1', fromNodeId: 'source', toNodeId: 'future_fx_1' }]
              }
            }
          },
          layerOrder: ['layer_1']
        }
      };

      const { project } = reconcileProject(futureProject);
      const layer = project.engine.layers.layer_1;

      // Unrecognized source is preserved with tag
      expect(layer.source.type).toBe('QuantumHologram');
      expect((layer.source as any).customResolution).toBe(4096);
      expect((layer.source as any)._unknownModule).toBe(true);

      // Unrecognized effect is preserved with tag
      const futureEff = layer.effects[0];
      expect(futureEff.type).toBe('HolographicInterferometer');
      expect(futureEff.beamCount).toBe(16);
      expect(futureEff._unknownModule).toBe(true);

      // Graph connections are intact
      expect(layer.graph.edges.length).toBe(1);
    });

    it('correctly handles template projects', () => {
      const templateData = {
        metadata: {
          version: '2.0',
          schemaVersion: 2,
          type: 'template',
          name: 'VJ Starter Rig'
        },
        engine: {
          layers: {
            layer_1: { id: 'layer_1', name: 'Layer 1', source: { type: 'NoiseSource' }, effects: [] }
          },
          layerOrder: ['layer_1']
        }
      };

      const { project, isTemplate } = reconcileProject(templateData);

      expect(isTemplate).toBe(true);
      expect(project.metadata.name).toBe('VJ Starter Rig Copy');
      expect(project.engine.projectName).toBe('VJ Starter Rig Copy');
    });

    it('handles empty or malformed layer graphs gracefully', () => {
      const malformed = {
        metadata: { name: 'Broken' },
        engine: {
          layers: {
            layer_1: {
              id: 'layer_1',
              source: null,
              effects: null,
              graph: null
            }
          }
        }
      };

      const { project } = reconcileProject(malformed);
      const layer = project.engine.layers.layer_1;

      expect(layer.source).toEqual({ type: 'None' });
      expect(Array.isArray(layer.effects)).toBe(true);
      expect(layer.graph).toEqual({ nodes: [], edges: [], disconnectedPorts: [] });
    });
  });

  describe('buildCurrentProject()', () => {
    it('serializes store state, metadata, and localStorage layouts', () => {
      localStorage.setItem('terp_node_layout', JSON.stringify({ layer_initial: { source: { x: 50, y: 100 } } }));
      useEngineStore.getState().setProjectName('Cosmic Feedback');
      useEngineStore.getState().setAuthorName('DJ Synth');

      const project = buildCurrentProject(false);

      expect(project.metadata.name).toBe('Cosmic Feedback');
      expect(project.metadata.author).toBe('DJ Synth');
      expect(project.metadata.type).toBe('project');
      expect(project.ui.layouts).toEqual({ layer_initial: { source: { x: 50, y: 100 } } });
    });
  });

  describe('Dirty State Tracking & Management', () => {
    it('starts clean on new project', () => {
      expect(useEngineStore.getState().isDirty).toBe(false);
    });

    it('marks dirty on layer updates, effect additions, and property changes', () => {
      useEngineStore.getState().setProjectName('New Name');
      expect(useEngineStore.getState().isDirty).toBe(true);

      useEngineStore.getState().markSaved();
      expect(useEngineStore.getState().isDirty).toBe(false);

      useEngineStore.getState().addEffect('layer_initial', { id: 'fx1', type: 'Transform2D' } as any);
      expect(useEngineStore.getState().isDirty).toBe(true);
    });

    it('resets dirty flag when loading a project', () => {
      useEngineStore.getState().setDirty(true);
      expect(useEngineStore.getState().isDirty).toBe(true);

      useEngineStore.getState().loadProject({
        layers: {
          layer_1: { id: 'layer_1', name: 'L1', source: { type: 'None' }, effects: [] }
        },
        layerOrder: ['layer_1'],
        resolution: { width: 1920, height: 1080 },
        globalAudioMuted: false,
        interLayerEdges: [],
        projectName: 'Loaded',
        authorName: 'User'
      });

      expect(useEngineStore.getState().isDirty).toBe(false);
      expect(useEngineStore.getState().projectName).toBe('Loaded');
    });
  });

  describe('Autosave Snapshot Recovery', () => {
    it('saves, retrieves, and clears autosave snapshots', () => {
      useEngineStore.getState().setProjectName('Emergency Session');
      saveAutosaveSnapshot();

      const snapshot = getAutosaveSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot?.project.metadata.name).toBe('Emergency Session');

      clearAutosaveSnapshot();
      expect(getAutosaveSnapshot()).toBeNull();
    });
  });

  describe('newProjectWithConfirmation()', () => {
    it('clears state cleanly when confirmed', () => {
      window.confirm = vi.fn().mockReturnValue(true);
      useEngineStore.getState().setProjectName('Work In Progress');
      useEngineStore.getState().setDirty(true);

      const success = newProjectWithConfirmation();
      expect(success).toBe(true);
      expect(useEngineStore.getState().projectName).toBe('Untitled Project');
      expect(useEngineStore.getState().isDirty).toBe(false);
    });

    it('aborts new project when user cancels confirmation', () => {
      window.confirm = vi.fn().mockReturnValue(false);
      useEngineStore.getState().setProjectName('Keep Me');
      useEngineStore.getState().setDirty(true);

      const success = newProjectWithConfirmation();
      expect(success).toBe(false);
      expect(useEngineStore.getState().projectName).toBe('Keep Me');
      expect(useEngineStore.getState().isDirty).toBe(true);
    });
  });
});

