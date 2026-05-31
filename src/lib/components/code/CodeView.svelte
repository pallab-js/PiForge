<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions -->
<script lang="ts">
  import { activeCanvasState, activeProject } from '../../stores/project.store';
  import { addToast } from '../../stores/ui.store';
  import { RPI_40PIN_HEADER, RPI_PICO_HEADER } from '../../rpi-boards';
  import { BUILTIN_COMPONENTS } from '../../components-library';

  let selectedLang = $state<'gpiozero' | 'rpigpio' | 'wiringpi'>('gpiozero');

  // Parse active canvas and generate configuration mapping
  interface PinConnection {
    bcm: number | null;
    physical: number;
    pinName: string;
    compName: string;
    compType: string;
    compPin: string;
  }

  let pinConnections = $derived.by<PinConnection[]>(() => {
    const canvas = $activeCanvasState;
    if (!canvas) return [];

    const connections: PinConnection[] = [];
    const rpiNodes = canvas.nodes.filter(n => n.type === 'rpi_board');
    if (rpiNodes.length === 0) return [];

    const rpiNode = rpiNodes[0];
    const header = rpiNode.boardModel?.includes('pico') ? RPI_PICO_HEADER : RPI_40PIN_HEADER;

    // Scan edges for connections to the RPi board
    canvas.edges.forEach(edge => {
      let rpiPinId: string | null = null;
      let targetNodeId: string | null = null;
      let compPinId: string | null = null;

      if (edge.sourceId === rpiNode.id && edge.sourcePinId) {
        rpiPinId = edge.sourcePinId;
        targetNodeId = edge.targetId;
        compPinId = edge.targetPinId || '1';
      } else if (edge.targetId === rpiNode.id && edge.targetPinId) {
        rpiPinId = edge.targetPinId;
        targetNodeId = edge.sourceId;
        compPinId = edge.sourcePinId || '1';
      }

      if (rpiPinId && targetNodeId) {
        const targetNode = canvas.nodes.find(n => n.id === targetNodeId);
        if (targetNode && targetNode.type === 'component') {
          const physicalPin = parseInt(rpiPinId);
          const pinInfo = header.find(p => p.physical === physicalPin);
          
          if (pinInfo) {
            connections.push({
              bcm: pinInfo.bcm,
              physical: physicalPin,
              pinName: pinInfo.function,
              compName: targetNode.label || 'Component',
              compType: targetNode.componentId || 'unknown',
              compPin: compPinId || '1'
            });
          }
        }
      }
    });

    return connections;
  });

  // COMPILE PYTHON TEMPLATE
  let compiledCode = $derived.by(() => {
    const proj = $activeProject;
    const name = proj ? proj.name : 'PiForge Project';
    const conns = pinConnections;

    if (selectedLang === 'gpiozero') {
      let imports = new Set<string>(['time']);
      let setupLines: string[] = [];
      let loopLines: string[] = [];

      conns.forEach(c => {
        if (c.bcm === null) return; // Ignore power/GND lines in software init

        if (c.compType === 'led') {
          imports.add('gpiozero');
          setupLines.push(`led = gpiozero.LED(${c.bcm}) # Connected to ${c.compName} (Pin ${c.physical})`);
          loopLines.push(`    led.on()\n    time.sleep(1)\n    led.off()\n    time.sleep(1)`);
        } else if (c.compType === 'button') {
          imports.add('gpiozero');
          setupLines.push(`button = gpiozero.Button(${c.bcm}) # Connected to ${c.compName} (Pin ${c.physical})`);
          loopLines.push(`    if button.is_pressed:\n        print("${c.compName} pressed!")\n        time.sleep(0.2)`);
        } else if (c.compType === 'relay') {
          imports.add('gpiozero');
          setupLines.push(`relay = gpiozero.OutputDevice(${c.bcm}, active_high=True) # Connected to ${c.compName} (Pin ${c.physical})`);
          loopLines.push(`    relay.on() # Switch relay on\n    time.sleep(2)\n    relay.off()\n    time.sleep(2)`);
        } else if (c.compType === 'servo') {
          imports.add('gpiozero');
          setupLines.push(`servo = gpiozero.Servo(${c.bcm}) # Connected to ${c.compName} (Pin ${c.physical})`);
          loopLines.push(`    servo.min()\n    time.sleep(1)\n    servo.mid()\n    time.sleep(1)\n    servo.max()\n    time.sleep(1)`);
        } else if (c.compType === 'buzzer') {
          imports.add('gpiozero');
          setupLines.push(`buzzer = gpiozero.Buzzer(${c.bcm}) # Connected to ${c.compName} (Pin ${c.physical})`);
          loopLines.push(`    buzzer.beep(on_time=0.5, off_time=0.5)\n    time.sleep(2)`);
        } else {
          setupLines.push(`# Generic Component on BCM ${c.bcm} (${c.compName})`);
        }
      });

      if (setupLines.length === 0) {
        setupLines.push('# Connect GPIO pins to accessories on the visual canvas first to scaffold scripts.');
      }

      const importBlock = Array.from(imports).map(imp => {
        if (imp === 'gpiozero') return 'import gpiozero';
        return `import ${imp}`;
      }).join('\n');

      return `#!/usr/bin/env python3
"""
PiForge Code Scaffolding
Project: ${name}
Target Board Primary GPIO layout
Compiled: ${new Date().toLocaleDateString()}
"""

${importBlock}

# Hardware Setup Configurations
${setupLines.join('\n')}

print("PiForge scaffolding scripts initialized!")

try:
    while True:
${loopLines.length > 0 ? loopLines.join('\n\n') : '    # Add active logic loops here\n    time.sleep(1)'}
except KeyboardInterrupt:
    print("\\nExecution stopped by user.")
`;
    } else if (selectedLang === 'rpigpio') {
      let setupLines: string[] = [];
      let loopLines: string[] = [];

      conns.forEach(c => {
        if (c.bcm === null) return;
        
        if (c.compType === 'button') {
          setupLines.push(`    GPIO.setup(${c.bcm}, GPIO.IN, pull_up_down=GPIO.PUD_UP) # ${c.compName}`);
          loopLines.push(`        if GPIO.input(${c.bcm}) == GPIO.LOW:\n            print("${c.compName} clicked!")\n            time.sleep(0.2)`);
        } else {
          setupLines.push(`    GPIO.setup(${c.bcm}, GPIO.OUT) # ${c.compName}`);
          loopLines.push(`        GPIO.output(${c.bcm}, GPIO.HIGH)\n        time.sleep(1)\n        GPIO.output(${c.bcm}, GPIO.LOW)\n        time.sleep(1)`);
        }
      });

      if (setupLines.length === 0) {
        setupLines.push('    # Setup pins here');
      }

      return `#!/usr/bin/env python3
import RPi.GPIO as GPIO
import time

# Use BCM GPIO pin numbering standard
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

def setup_hardware():
${setupLines.join('\n')}

setup_hardware()

print("RPi.GPIO setup configured. Press Ctrl+C to stop.")

try:
    while True:
${loopLines.length > 0 ? loopLines.join('\n') : '        time.sleep(1)'}
except KeyboardInterrupt:
    GPIO.cleanup()
    print("\\nGPIO cleanup completed.")
`;
    } else {
      // WiringPi C++
      let setupLines: string[] = [];
      let loopLines: string[] = [];

      conns.forEach(c => {
        if (c.bcm === null) return;
        
        if (c.compType === 'button') {
          setupLines.push(`  pinMode(${c.bcm}, INPUT);\n  pullUpDnControl(${c.bcm}, PUD_UP); // ${c.compName}`);
          loopLines.push(`    if (digitalRead(${c.bcm}) == LOW) {\n        std::cout << "${c.compName} Clicked!" << std::endl;\n        delay(200);\n    }`);
        } else {
          setupLines.push(`  pinMode(${c.bcm}, OUTPUT); // ${c.compName}`);
          loopLines.push(`    digitalWrite(${c.bcm}, HIGH);\n    delay(1000);\n    digitalWrite(${c.bcm}, LOW);\n    delay(1000);`);
        }
      });

      if (setupLines.length === 0) {
        setupLines.push('  // Initialize pins');
      }

      return `// C++ WiringPi Scaffolding Template
#include <wiringPi.h>
#include <iostream>

int main(void) {
  // Use BCM GPIO layout standard
  if (wiringPiSetupGpio() == -1) {
    std::cerr << "WiringPi Setup Failed!" << std::endl;
    return 1;
  }

  // Configurations
${setupLines.join('\n')}

  std::cout << "PiForge C++ scaffold initialized!" << std::endl;

  while(true) {
${loopLines.length > 0 ? loopLines.join('\n') : '    delay(1000);'}
  }

  return 0;
}
`;
    }
  });

  function handleCopy() {
    navigator.clipboard.writeText(compiledCode);
    addToast('Scaffold code copied to clipboard!', 'success');
  }

  function handleDownload() {
    const ext = selectedLang === 'wiringpi' ? 'cpp' : 'py';
    const blob = new Blob([compiledCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scaffold.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Template script downloaded!', 'success');
  }
</script>

<div class="flex flex-col h-full w-full bg-[var(--bg-base)] select-none">
  <!-- Codebar Header toolbar selectors -->
  <div class="flex items-center justify-between p-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0">
    <div class="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span>Language Standard:</span>
      <select 
        bind:value={selectedLang}
        class="bg-[var(--bg-card)] border border-[var(--border-default)] rounded px-2.5 py-1 text-[var(--text-primary)] outline-none cursor-pointer font-medium"
      >
        <option value="gpiozero">Python (gpiozero - OOP)</option>
        <option value="rpigpio">Python (RPi.GPIO - Classic)</option>
        <option value="wiringpi">C++ (WiringPi)</option>
      </select>
    </div>

    <div class="flex gap-2">
      <button 
        onclick={handleCopy}
        class="px-3.5 py-1 bg-[var(--accent-coral)] hover:bg-[var(--accent-coral-hover)] text-[var(--text-inverse)] text-xs font-semibold rounded transition-colors cursor-pointer"
      >
        📋 Copy Script
      </button>
      <button 
        onclick={handleDownload}
        class="px-3.5 py-1 bg-[var(--bg-card)] border border-[var(--border-default)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold rounded transition-colors cursor-pointer"
      >
        📥 Download File
      </button>
    </div>
  </div>

  <!-- Code Block editor display pane -->
  <div class="flex-1 overflow-auto p-4 select-text">
    <div class="relative bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg overflow-hidden h-full flex flex-col font-mono text-xs">
      <div class="flex items-center h-8 px-4 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] justify-between select-none">
        <span class="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
          {selectedLang === 'wiringpi' ? 'C++' : 'Python'} Terminal Output
        </span>
        <div class="flex gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-[var(--color-error)] opacity-35"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[var(--accent-amber)] opacity-35"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[var(--accent-teal)] opacity-35"></span>
        </div>
      </div>

      <pre class="flex-1 p-4 overflow-auto text-[var(--text-secondary)] leading-relaxed selection:bg-[var(--accent-coral-dim)]">
        <code>{compiledCode}</code>
      </pre>
    </div>
  </div>
</div>
