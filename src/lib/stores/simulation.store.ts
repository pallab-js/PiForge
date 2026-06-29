import { writable, get } from 'svelte/store';
import { activeCanvasState } from './project.store';
import type { CanvasState, CanvasNode, CanvasEdge } from '../types';
import { RPI_40PIN_HEADER, RPI_PICO_HEADER } from '../rpi-boards';

// Main simulation activation state
export const isSimulating = writable(false);

// Internal state of interactive accessories
// E.g., nodeSimStates[nodeId] = { pressed: true, lit: false, angle: 45, etc. }
export const nodeSimStates = writable<Record<string, any>>({});

// Active logic levels on physical board GPIO pins
// E.g. boardPinStates[pinPhysicalNumber] = 0 | 1 (Low / High)
export const boardPinStates = writable<Record<string, 0 | 1>>({});

// Precomputed set of powered canvas edges (PERF-06)
export const poweredEdges = writable<Set<string>>(new Set());

// Track current macro loop interval for automated runs (e.g. blinking)
let macroInterval: any = null;
export const activeMacroName = writable<string | null>(null);

// Reset simulation states
export function resetSimulation() {
  stopMacro();
  nodeSimStates.set({});
  boardPinStates.set({});
  poweredEdges.set(new Set());
}

// Toggle simulation mode
export function toggleSimulation() {
  const current = get(isSimulating);
  if (current) {
    isSimulating.set(false);
    resetSimulation();
  } else {
    isSimulating.set(true);
    initializeSimulationStates();
  }
}

// Initialise states for nodes currently on canvas
export function initializeSimulationStates() {
  const canvas = get(activeCanvasState);
  if (!canvas) return;

  const states: Record<string, any> = {};
  const boardPins: Record<string, 0 | 1> = {};

  canvas.nodes.forEach(node => {
    if (node.type === 'component') {
      if (node.componentId === 'led') {
        states[node.id] = { lit: false };
      } else if (node.componentId === 'button') {
        states[node.id] = { pressed: false };
      } else if (node.componentId === 'buzzer') {
        states[node.id] = { active: false };
      } else if (node.componentId === 'relay') {
        states[node.id] = { closed: false };
      } else if (node.componentId === 'servo') {
        states[node.id] = { angle: 90 };
      } else if (node.componentId === 'oled') {
        states[node.id] = { isOn: false, text: ['PiForge', 'SSD1306', 'Offline...'] };
      } else if (node.componentId === 'lcd1602') {
        states[node.id] = { isOn: false, text: ['PiForge LCD1602', 'Simulating...'] };
      } else if (node.componentId === 'dht22') {
        states[node.id] = { temp: 24.5, humidity: 52 };
      } else if (node.componentId === 'ds18b20') {
        states[node.id] = { temp: 23.8 };
      } else if (node.componentId === 'hcsr04') {
        states[node.id] = { distance: 65 };
      } else if (node.componentId === 'rotary') {
        states[node.id] = { steps: 0, buttonPressed: false };
      } else if (node.componentId === 'mcp3008') {
        states[node.id] = { values: [0.1, 0.4, 0.8, 0, 0, 0, 0, 0] };
      } else if (node.componentId === 'l298n') {
        states[node.id] = { motorA: 0, motorB: 0 };
      }
    } else if (node.type === 'rpi_board') {
      // Default GPIO pins to 0 (Low)
      const header = node.boardModel?.includes('pico') ? RPI_PICO_HEADER : RPI_40PIN_HEADER;
      header.forEach(p => {
        if (p.type === 'gpio' || p.type === 'adc') {
          boardPins[p.physical.toString()] = 0;
        }
      });
    }
  });

  nodeSimStates.set(states);
  boardPinStates.set(boardPins);
  propagateSignals();
}

// Drive high/low state manually on a specific board pin
export function toggleBoardPin(pinId: string) {
  if (!get(isSimulating)) return;
  boardPinStates.update(current => {
    const nextVal = current[pinId] === 1 ? 0 : 1;
    return { ...current, [pinId]: nextVal };
  });
  propagateSignals();
}

// Set visual component internal value
export function updateNodeSimState(nodeId: string, newState: Record<string, any>) {
  if (!get(isSimulating)) return;
  nodeSimStates.update(current => {
    const next = { ...current };
    next[nodeId] = { ...(next[nodeId] || {}), ...newState };
    return next;
  });
  propagateSignals();
}

// Propagate electric signals (voltage levels) through visual SVG wires
export function propagateSignals() {
  if (!get(isSimulating)) return;
  const canvas = get(activeCanvasState);
  if (!canvas) return;

  const currentStates = get(nodeSimStates);
  const currentPinStates = get(boardPinStates);

  // We will trace active signal values for each node and wire.
  // 1. Identify which pins/nodes are active High (logical 1 / Voltage)
  const activeSources = new Set<string>(); // "nodeId:pinId"
  const gndSources = new Set<string>(); // GND pins

  // Find board power / gnd pins
  const boardNode = canvas.nodes.find(n => n.type === 'rpi_board');
  if (boardNode) {
    const header = boardNode.boardModel?.includes('pico') ? RPI_PICO_HEADER : RPI_40PIN_HEADER;
    header.forEach(p => {
      const pinStr = p.physical.toString();
      if (p.type === 'power5v' || p.type === 'power3v3') {
        activeSources.add(`${boardNode.id}:${pinStr}`);
      } else if (p.type === 'gnd') {
        gndSources.add(`${boardNode.id}:${pinStr}`);
      } else if (currentPinStates[pinStr] === 1) {
        activeSources.add(`${boardNode.id}:${pinStr}`);
      } else {
        gndSources.add(`${boardNode.id}:${pinStr}`);
      }
    });
  }

  // Find component outputs
  canvas.nodes.forEach(node => {
    if (node.type === 'component') {
      const compState = currentStates[node.id];
      if (!compState) return;

      if (node.componentId === 'button' && compState.pressed) {
        // A pressed button shorts Pin 1 to High or Low.
        // Let's assume it drives Pin 1 to High (1) for easy visual wire propagation.
        activeSources.add(`${node.id}:1`);
      } else if (node.componentId === 'rotary') {
        if (compState.buttonPressed) activeSources.add(`${node.id}:3`); // SW pin
      }
    }
  });

  // 2. Perform a simple BFS propagation down the wires (edges) to trace high signals
  const poweredPins = new Set<string>(activeSources);
  const queue = Array.from(activeSources);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const [nodeId, pinId] = current.split(':');

    // Find any wire connected to this pin
    canvas.edges.forEach(edge => {
      let linkedPin: string | null = null;

      if (edge.sourceId === nodeId && edge.sourcePinId === pinId) {
        linkedPin = `${edge.targetId}:${edge.targetPinId || '1'}`;
      } else if (edge.targetId === nodeId && edge.targetPinId === pinId) {
        linkedPin = `${edge.sourceId}:${edge.sourcePinId || '1'}`;
      }

      if (linkedPin && !poweredPins.has(linkedPin)) {
        poweredPins.add(linkedPin);
        queue.push(linkedPin);
      }
    });
  }

  // 3. Update component reactive states based on which pins receive power
  nodeSimStates.update(current => {
    const next = { ...current };

    canvas.nodes.forEach(node => {
      if (node.type !== 'component' || !next[node.id]) return;

      const ledId = node.id;
      if (node.componentId === 'led') {
        // Lit if Pin 1 (anode) is powered
        const pin1Powered = poweredPins.has(`${ledId}:1`);
        next[ledId] = { ...next[ledId], lit: pin1Powered };
      } else if (node.componentId === 'buzzer') {
        // Active if Pin 1 is powered
        const active = poweredPins.has(`${ledId}:1`);
        next[ledId] = { ...next[ledId], active };
      } else if (node.componentId === 'relay') {
        // Closed if Pin 3 (Signal) is powered and Pin 1 (VCC) is powered
        const sigPowered = poweredPins.has(`${ledId}:3`);
        next[ledId] = { ...next[ledId], closed: sigPowered };
      } else if (node.componentId === 'servo') {
        // Angle reacts if Pin 3 (PWM/Signal) is powered. Move to 180, otherwise default 90.
        const sigPowered = poweredPins.has(`${ledId}:3`);
        next[ledId] = { ...next[ledId], angle: sigPowered ? 180 : 90 };
      } else if (node.componentId === 'oled') {
        // OLED display lights up if Pin 1 (VCC) is connected to power
        const powered = poweredPins.has(`${ledId}:1`);
        next[ledId] = { ...next[ledId], isOn: powered };
      } else if (node.componentId === 'lcd1602') {
        // LCD display lights up if Pin 1 (VCC) is connected to power
        const powered = poweredPins.has(`${ledId}:1`);
        next[ledId] = { ...next[ledId], isOn: powered };
      }
    });

    return next;
  });

  // 4. Update powered edges set (PERF-06)
  const poweredSet = new Set<string>();
  canvas.edges.forEach(edge => {
    const srcPin = `${edge.sourceId}:${edge.sourcePinId || '1'}`;
    const dstPin = `${edge.targetId}:${edge.targetPinId || '1'}`;
    if (poweredPins.has(srcPin) || poweredPins.has(dstPin)) {
      poweredSet.add(edge.id);
    }
  });
  poweredEdges.set(poweredSet);
}

// Helper to check if a specific canvas edge/wire is currently carrying voltage
export function isEdgePowered(edgeId: string, _canvas?: CanvasState): boolean {
  if (!get(isSimulating)) return false;
  return get(poweredEdges).has(edgeId);
}

// MACRO SCHEDULERS (Auto firmware loops simulation)
export function startMacro(macroName: string) {
  stopMacro();
  activeMacroName.set(macroName);

  if (macroName === 'blink') {
    let high = true;
    macroInterval = setInterval(() => {
      // Find GPIO pin that matches LED wire connection
      const canvas = get(activeCanvasState);
      if (!canvas) return;

      const boardNode = canvas.nodes.find(n => n.type === 'rpi_board');
      const ledNode = canvas.nodes.find(n => n.type === 'component' && n.componentId === 'led');
      
      if (boardNode && ledNode) {
        // Find which pin connects board to LED
        const wire = canvas.edges.find(e => 
          (e.sourceId === boardNode.id && e.targetId === ledNode.id) ||
          (e.targetId === boardNode.id && e.sourceId === ledNode.id)
        );

        if (wire) {
          const boardPin = wire.sourceId === boardNode.id ? wire.sourcePinId : wire.targetPinId;
          if (boardPin) {
            boardPinStates.update(current => ({
              ...current,
              [boardPin]: high ? 1 : 0
            }));
            propagateSignals();
          }
        }
      }
      high = !high;
    }, 500); // Blink every 500ms
  } else if (macroName === 'sweep') {
    let angle = 0;
    let dir = 15;
    macroInterval = setInterval(() => {
      const canvas = get(activeCanvasState);
      if (!canvas) return;

      const servoNode = canvas.nodes.find(n => n.type === 'component' && n.componentId === 'servo');
      if (servoNode) {
        angle += dir;
        if (angle >= 180) {
          angle = 180;
          dir = -15;
        } else if (angle <= 0) {
          angle = 0;
          dir = 15;
        }
        updateNodeSimState(servoNode.id, { angle });
      }
    }, 150);
  }
}

export function stopMacro() {
  if (macroInterval) {
    clearInterval(macroInterval);
    macroInterval = null;
  }
  activeMacroName.set(null);
}
