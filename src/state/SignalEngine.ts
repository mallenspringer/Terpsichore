import { LayerState, AnySource, SignalProcessorSource } from './types';

export function calculateSignalGraph(layer: LayerState): Record<string, number> {
  const edges = layer.graph?.edges || [];
  const signalValues: Record<string, number> = {};

  // For LFOs and other internal generators, we might need a global time.
  // But for now, we'll assume modulators (LFO, MIDI) are already updated in the store.
  
  // We need a way to resolve node values in the correct order.
  // To keep it simple and robust against cycles, we'll use a recursive approach with memoization.
  const resolved = new Set<string>();

  const resolvePort = (nodeId: string, portId: string, depth = 0): number => {
    const key = `${nodeId}.${portId}`;
    if (resolved.has(key)) return signalValues[key] || 0;
    if (depth > 20) return 0; // Prevent infinite loops

    // Check if there is an incoming edge
    const incoming = edges.find(e => e.toNodeId === nodeId && e.toPort === portId);
    if (incoming) {
      const val = resolvePort(incoming.fromNodeId, incoming.fromPort, depth + 1);
      signalValues[key] = val;
      resolved.add(key);
      return val;
    }

    // If no incoming edge, get the value from the node itself
    let val = 0;
    if (nodeId === 'source') {
      val = getSourcePortValue(layer.source, portId);
    } else {
      const effect = layer.effects.find(e => e.id === nodeId);
      if (effect) {
        val = (effect as any)[portId] ?? 0;
      }
    }

    signalValues[key] = val;
    resolved.add(key);
    return val;
  };

  // Process all nodes that have "Data" output ports
  // 1. Source (if it's a SignalProcessor or has analysis ports)
  if (layer.source.type === 'SignalProcessor') {
    const sp = layer.source as SignalProcessorSource;
    const a = resolvePort('source', 'in_a');
    const bEdge = edges.find(e => e.toNodeId === 'source' && e.toPort === 'in_b');
    const b = bEdge ? resolvePort(bEdge.fromNodeId, bEdge.fromPort) : sp.operandB;
    
    let result = 0;
    switch (sp.operation) {
      case 'add': result = a + b; break;
      case 'subtract': result = a - b; break;
      case 'multiply': result = a * b; break;
      case 'divide': result = b !== 0 ? a / b : 0; break;
      case 'modulo': result = b !== 0 ? a % b : 0; break;
      case 'pow': result = Math.pow(a, b); break;
      case 'min': result = Math.min(a, b); break;
      case 'max': result = Math.max(a, b); break;
    }
    signalValues['source.out'] = result;
    resolved.add('source.out');
  }

  // TODO: Add more node types as they are built (LFO nodes, Audio nodes, etc.)
  
  return signalValues;
}

function getSourcePortValue(source: AnySource, portId: string): number {
  // Analysis ports or generator outputs
  if (source.type === 'AudioInput' || source.type === 'AudioFile' || source.type === 'SystemAudio') {
    // For now, these are handled by a separate analyzer that updates store.
    // We can add "volume" or "peak" here later.
    return (source as any)[portId] ?? 0;
  }
  return (source as any)[portId] ?? 0;
}
