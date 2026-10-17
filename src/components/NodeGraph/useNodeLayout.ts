import { useState, useEffect, useCallback } from 'react';

export interface NodeUIState {
  x: number;
  y: number;
  controlOrder: string[];
  visibleRows: number;
  expanded: boolean;
  patchbayExpanded: boolean;
  expandedGroups?: string[];
}

const LAYOUT_KEY = 'terp_node_layout';

function loadLayout(layerId: string): Record<string, NodeUIState> {
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    return all[layerId] || {};
  } catch {
    return {};
  }
}

function saveLayout(layerId: string, layout: Record<string, NodeUIState>) {
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    all[layerId] = layout;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
  } catch {}
}

export function useNodeLayout(layerId: string | null) {
  const [layout, setLayout] = useState<Record<string, NodeUIState>>({});

  useEffect(() => {
    if (layerId) setLayout(loadLayout(layerId));
    else setLayout({});
  }, [layerId]);

  const getNodeState = useCallback((nodeId: string, defaultState: Partial<NodeUIState>): NodeUIState => {
    const base: NodeUIState = {
      x: 0,
      y: 10,
      controlOrder: [],
      visibleRows: 3,
      expanded: false,
      patchbayExpanded: false,
      ...defaultState,
    };
    return { ...base, ...(layout[nodeId] || {}) };
  }, [layout]);

  const updateNodeState = useCallback((nodeId: string, updates: Partial<NodeUIState>) => {
    setLayout(prev => {
      const next = { ...prev, [nodeId]: { ...prev[nodeId], ...updates } };
      if (layerId) saveLayout(layerId, next);
      return next;
    });
  }, [layerId]);

  return { getNodeState, updateNodeState };
}
