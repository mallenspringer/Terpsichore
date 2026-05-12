import { LayerState, LayerGraph, GraphEdge } from './types';
import { PORT_DEFS, getPrimaryOutput } from '../components/NodeGraph/portDefs';

const OUTPUT_ID = '__output__';

export function buildAutoEdges(layer: LayerState, existingGraph?: LayerGraph): GraphEdge[] {
  const nodes = [
    ...(layer.source.type !== 'None' ? [{ id: 'source', type: layer.source.type }] : []),
    ...layer.effects.map(ef => ({ id: ef.id, type: ef.type })),
    ...Object.entries(layer.modulators || {}).map(([id, mod]) => ({ id, type: mod.type })),
  ];

  if (nodes.length === 0) return [];

  // Track type counts to implement the "no auto-route for duplicates" rule
  const typeCounts: Record<string, number> = {};
  const nodesWithCounts = nodes.map(n => {
    const count = (typeCounts[n.type] || 0) + 1;
    typeCounts[n.type] = count;
    return { ...n, isDuplicate: count > 1 };
  });

  const nodeIds = new Set(nodes.map(n => n.id));
  nodeIds.add(OUTPUT_ID);

  const manualEdges = (existingGraph?.edges ?? []).filter(e => 
    !e.isAuto && nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)
  );
  const disconnectedPorts = (existingGraph?.disconnectedPorts ?? []).filter(p => {
    const [nid] = p.split('.');
    return nodeIds.has(nid);
  });
  const isPortOccupied = (toNodeId: string, toPortId: string) => 
    manualEdges.some(e => e.toNodeId === toNodeId && e.toPort === toPortId) ||
    disconnectedPorts.includes(`${toNodeId}.${toPortId}`);

  const manualOutputTarget = existingGraph?.manualOutputTarget;
  const manualStillExists = manualOutputTarget && nodes.some(n => n.id === manualOutputTarget);

  const lastNode = nodes[nodes.length - 1];
  const outputTarget = (() => {
    if (!manualStillExists) return lastNode?.id;
    const manualIdx = nodes.findIndex(n => n.id === manualOutputTarget);
    if (manualIdx < nodes.length - 1) return lastNode.id;
    return manualOutputTarget;
  })();

  const autoEdges: GraphEdge[] = [];
  
  // Identify video nodes that ARE NOT duplicates (except source which is always allowed)
  const videoNodes = nodesWithCounts.filter(n => {
    if (n.id === 'source') return true;
    if (n.isDuplicate) return false;
    const defs = PORT_DEFS[n.type] || [];
    return defs.some(p => p.signalType === 'video');
  });

  // Chain edges: videoNode[i] → videoNode[i+1]
  for (let i = 0; i < videoNodes.length - 1; i++) {
    const from = videoNodes[i];
    const to = videoNodes[i + 1];
    const fromPort = getPrimaryOutput(from.type);
    const toPort = PORT_DEFS[to.type]?.find(p => p.direction === 'in' && p.signalType === 'video');
    
    if (fromPort && toPort && !isPortOccupied(to.id, toPort.id)) {
      autoEdges.push({
        id: `auto_${from.id}_${to.id}`,
        fromNodeId: from.id,
        fromPort: fromPort.id,
        toNodeId: to.id,
        toPort: toPort.id,
        signalType: 'video',
        isAuto: true,
      });
    }
  }

  // Output edge
  const lastVideoNode = videoNodes[videoNodes.length - 1];
  const outSrcNode = videoNodes.find(n => n.id === outputTarget) ?? lastVideoNode;
  const outPort = outSrcNode ? getPrimaryOutput(outSrcNode.type) : null;
  
  if (outPort && !isPortOccupied(OUTPUT_ID, 'composite_in')) {
    autoEdges.push({
      id: 'auto_to_output',
      fromNodeId: outSrcNode.id,
      fromPort: outPort.id,
      toNodeId: OUTPUT_ID,
      toPort: 'composite_in',
      signalType: 'video',
      isAuto: true,
    });
  }

  return [...autoEdges, ...manualEdges];
}
