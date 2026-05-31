<!-- svelte-ignore a11y_no_static_element_interactions a11y-no-static-element-interactions -->
<script lang="ts">
  import { activeCanvasState, activeProject } from '../../stores/project.store';
  import { addToast } from '../../stores/ui.store';
  import { RPI_40PIN_HEADER, RPI_PICO_HEADER } from '../../rpi-boards';
  import { BUILTIN_COMPONENTS } from '../../components-library';

  let selectedLang = $state<'gpiozero' | 'rpigpio' | 'wiringpi'>('gpiozero');

  // Group pin connections by component node for enhanced multi-pin accessory initialization
  interface ComponentCodeInfo {
    id: string;
    type: string;
    name: string;
    pins: Record<string, { bcm: number; physical: number }>;
  }

  let componentInstances = $derived.by<ComponentCodeInfo[]>(() => {
    const canvas = $activeCanvasState;
    if (!canvas) return [];

    const rpiNodes = canvas.nodes.filter(n => n.type === 'rpi_board');
    if (rpiNodes.length === 0) return [];
    const rpiNode = rpiNodes[0];
    const header = rpiNode.boardModel?.includes('pico') ? RPI_PICO_HEADER : RPI_40PIN_HEADER;

    // Find all component nodes
    const compNodes = canvas.nodes.filter(n => n.type === 'component');
    
    return compNodes.map(node => {
      const pins: Record<string, { bcm: number; physical: number }> = {};
      
      canvas.edges.forEach(edge => {
        let rpiPinId: string | undefined = undefined;
        let compPinId: string | undefined = undefined;
        
        if (edge.sourceId === rpiNode.id && edge.targetId === node.id) {
          rpiPinId = edge.sourcePinId;
          compPinId = edge.targetPinId || '1';
        } else if (edge.targetId === rpiNode.id && edge.sourceId === node.id) {
          rpiPinId = edge.targetPinId;
          compPinId = edge.sourcePinId || '1';
        }
        
        if (rpiPinId && compPinId) {
          const physicalPin = parseInt(rpiPinId);
          const pinInfo = header.find(p => p.physical === physicalPin);
          if (pinInfo && pinInfo.bcm !== null) {
            pins[compPinId] = { bcm: pinInfo.bcm, physical: physicalPin };
          }
        }
      });
      
      return {
        id: node.id.replace(/-/g, '_'),
        type: node.componentId || 'unknown',
        name: node.label || 'Component',
        pins
      };
    });
  });

  // COMPILE HARDWARE TEMPLATE SCRIPT
  let compiledCode = $derived.by(() => {
    const proj = $activeProject;
    const name = proj ? proj.name : 'PiForge Project';

    if (selectedLang === 'gpiozero') {
      let imports = new Set<string>(['time']);
      let setupLines: string[] = [];
      let loopLines: string[] = [];

      componentInstances.forEach(c => {
        const p1 = c.pins['1']?.bcm;
        const p2 = c.pins['2']?.bcm;
        const p3 = c.pins['3']?.bcm;
        const p4 = c.pins['4']?.bcm;
        const p5 = c.pins['5']?.bcm;

        if (c.type === 'led') {
          imports.add('gpiozero');
          const pin = p1 !== undefined ? p1 : 17;
          setupLines.push(`${c.id}_led = gpiozero.LED(${pin}) # ${c.name} (Pin ${c.pins['1']?.physical || 'GP17'})`);
          loopLines.push(`    # Blink ${c.name}\n    ${c.id}_led.on()\n    time.sleep(0.5)\n    ${c.id}_led.off()\n    time.sleep(0.5)`);
        } else if (c.type === 'button') {
          imports.add('gpiozero');
          const pin = p1 !== undefined ? p1 : 18;
          setupLines.push(`${c.id}_btn = gpiozero.Button(${pin}) # ${c.name} (Pin ${c.pins['1']?.physical || 'GP18'})`);
          loopLines.push(`    # Read Button ${c.name}\n    if ${c.id}_btn.is_pressed:\n        print("${c.name} was pressed!")\n        time.sleep(0.2)`);
        } else if (c.type === 'rotary') {
          imports.add('gpiozero');
          const pinA = p1 !== undefined ? p1 : 17;
          const pinB = p2 !== undefined ? p2 : 18;
          const pinSW = p3 !== undefined ? p3 : 27;
          setupLines.push(`${c.id}_rotary = gpiozero.RotaryEncoder(${pinA}, ${pinB}) # ${c.name} CLK/DT\n${c.id}_rotary_btn = gpiozero.Button(${pinSW}) # ${c.name} SW`);
          loopLines.push(`    # Read Rotary ${c.name}\n    print("${c.name} Steps:", ${c.id}_rotary.steps)\n    if ${c.id}_rotary_btn.is_pressed:\n        print("${c.name} Switch clicked!")\n        time.sleep(0.2)`);
        } else if (c.type === 'dht22') {
          const pin = p2 !== undefined ? p2 : 4;
          setupLines.push(`# ${c.name} (DHT22 DATA on BCM ${pin})\n# Requires Adafruit CircuitPython DHT library (pip3 install adafruit-circuitpython-dht)\nimport adafruit_dht\nimport board\n${c.id}_dht = adafruit_dht.DHT22(board.D${pin})`);
          loopLines.push(`    # Read Temperature and Humidity from ${c.name}\n    try:\n        t = ${c.id}_dht.temperature\n        h = ${c.id}_dht.humidity\n        if t is not None:\n            print(f"${c.name} -> Temp: {t:.1f}°C, Humidity: {h:.1f}%")\n    except RuntimeError as err:\n        pass`);
        } else if (c.type === 'hcsr04') {
          imports.add('gpiozero');
          const pinTrig = p2 !== undefined ? p2 : 23;
          const pinEcho = p3 !== undefined ? p3 : 24;
          setupLines.push(`${c.id}_sonar = gpiozero.DistanceSensor(echo=${pinEcho}, trigger=${pinTrig}) # ${c.name} Echo/Trig`);
          loopLines.push(`    # Read distance from ${c.name}\n    print(f"${c.name} Distance: {${c.id}_sonar.distance * 100:.1f} cm")`);
        } else if (c.type === 'servo') {
          imports.add('gpiozero');
          const pin = p3 !== undefined ? p3 : 25;
          setupLines.push(`${c.id}_servo = gpiozero.Servo(${pin}) # ${c.name} PWM`);
          loopLines.push(`    # Sweep Servo motor ${c.name}\n    ${c.id}_servo.min()\n    time.sleep(1)\n    ${c.id}_servo.mid()\n    time.sleep(1)\n    ${c.id}_servo.max()\n    time.sleep(1)`);
        } else if (c.type === 'relay') {
          imports.add('gpiozero');
          const pin = p3 !== undefined ? p3 : 26;
          setupLines.push(`${c.id}_relay = gpiozero.OutputDevice(${pin}, active_high=True) # ${c.name} Signal`);
          loopLines.push(`    # Toggle Relay status ${c.name}\n    ${c.id}_relay.on()\n    time.sleep(2)\n    ${c.id}_relay.off()\n    time.sleep(2)`);
        } else if (c.type === 'buzzer') {
          imports.add('gpiozero');
          const pin = p1 !== undefined ? p1 : 5;
          setupLines.push(`${c.id}_buzzer = gpiozero.Buzzer(${pin}) # ${c.name}`);
          loopLines.push(`    # Beep Buzzer ${c.name}\n    ${c.id}_buzzer.beep(on_time=0.2, off_time=0.2)\n    time.sleep(1.5)`);
        } else if (c.type === 'oled') {
          setupLines.push(`# ${c.name} (I2C OLED SSD1306) on SCL/SDA\n# Requires luma.oled package (pip3 install luma.oled)\nfrom luma.core.interface.serial import i2c\nfrom luma.oled.device import ssd1306\nfrom luma.core.render import canvas\n${c.id}_serial = i2c(port=1, address=0x3C)\n${c.id}_oled = ssd1306(${c.id}_serial)`);
          loopLines.push(`    # Write text layout on ${c.name}\n    with canvas(${c.id}_oled) as draw:\n        draw.text((0, 0), "PiForge Active", fill="white")\n        draw.text((0, 16), "SSD1306 Display", fill="white")`);
        } else if (c.type === 'lcd1602') {
          setupLines.push(`# ${c.name} (I2C LCD1602 Backpack)\n# Requires RPLCD package (pip3 install RPLCD)\nfrom RPLCD.i2c import CharLCD\n${c.id}_lcd = CharLCD('PCF8574', 0x27, port=1, cols=16, rows=2)`);
          loopLines.push(`    # Print on ${c.name}\n    ${c.id}_lcd.clear()\n    ${c.id}_lcd.write_string("PiForge LCD1602\\nStatus: Online")`);
        } else if (c.type === 'l298n') {
          imports.add('gpiozero');
          const pinIN1 = p2 !== undefined ? p2 : 5;
          const pinIN2 = p3 !== undefined ? p3 : 6;
          const pinIN3 = p4 !== undefined ? p4 : 12;
          const pinIN4 = p5 !== undefined ? p5 : 13;
          setupLines.push(`${c.id}_motor_a = gpiozero.Motor(forward=${pinIN1}, backward=${pinIN2}) # ${c.name} A\n${c.id}_motor_b = gpiozero.Motor(forward=${pinIN3}, backward=${pinIN4}) # ${c.name} B`);
          loopLines.push(`    # Drive L298N motors forward\n    ${c.id}_motor_a.forward(speed=0.6)\n    ${c.id}_motor_b.forward(speed=0.6)\n    time.sleep(2.0)\n    ${c.id}_motor_a.stop()\n    ${c.id}_motor_b.stop()`);
        } else if (c.type === 'mcp3008') {
          imports.add('gpiozero');
          setupLines.push(`${c.id}_adc = gpiozero.MCP3008(channel=0) # ${c.name}`);
          loopLines.push(`    # Read Analog ADC channel 0\n    print("${c.name} Reading:", ${c.id}_adc.value)`);
        } else if (c.type === 'ds18b20') {
          setupLines.push(`# ${c.name} (DS18B20 1-Wire Temp Sensor on BCM ${p2 || 4})\n# Requires w1thermsensor (pip3 install w1thermsensor)\nfrom w1thermsensor import W1ThermSensor\n${c.id}_ds18 = W1ThermSensor()`);
          loopLines.push(`    # Read DS18B20 Temperature sensor\n    print(f"${c.name} Temp: {${c.id}_ds18.get_temperature():.2f}°C")`);
        } else {
          setupLines.push(`# Generic accessory ${c.name} (Type: ${c.type})`);
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
Target Board: Raspberry Pi 4/5 / Pico Series
Compiled: ${new Date().toLocaleDateString()}
"""

${importBlock}

# Hardware Setup Configurations
${setupLines.join('\n\n')}

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

      componentInstances.forEach(c => {
        const p1 = c.pins['1']?.bcm;
        const p2 = c.pins['2']?.bcm;
        const p3 = c.pins['3']?.bcm;
        const p4 = c.pins['4']?.bcm;
        const p5 = c.pins['5']?.bcm;

        if (c.type === 'led') {
          const pin = p1 !== undefined ? p1 : 17;
          setupLines.push(`    GPIO.setup(${pin}, GPIO.OUT) # ${c.name}`);
          loopLines.push(`        # Blink ${c.name}\n        GPIO.output(${pin}, GPIO.HIGH)\n        time.sleep(0.5)\n        GPIO.output(${pin}, GPIO.LOW)\n        time.sleep(0.5)`);
        } else if (c.type === 'button') {
          const pin = p1 !== undefined ? p1 : 18;
          setupLines.push(`    GPIO.setup(${pin}, GPIO.IN, pull_up_down=GPIO.PUD_UP) # ${c.name}`);
          loopLines.push(`        # Read Button ${c.name}\n        if GPIO.input(${pin}) == GPIO.LOW:\n            print("${c.name} pressed!")\n            time.sleep(0.2)`);
        } else if (c.type === 'rotary') {
          const pinA = p1 !== undefined ? p1 : 17;
          const pinB = p2 !== undefined ? p2 : 18;
          const pinSW = p3 !== undefined ? p3 : 27;
          setupLines.push(`    GPIO.setup(${pinA}, GPIO.IN, pull_up_down=GPIO.PUD_UP) # CLK\n    GPIO.setup(${pinB}, GPIO.IN, pull_up_down=GPIO.PUD_UP) # DT\n    GPIO.setup(${pinSW}, GPIO.IN, pull_up_down=GPIO.PUD_UP) # SW`);
          loopLines.push(`        # Read ${c.name}\n        if GPIO.input(${pinSW}) == GPIO.LOW:\n            print("${c.name} Clicked!")`);
        } else if (c.type === 'dht22') {
          const pin = p2 !== undefined ? p2 : 4;
          setupLines.push(`    # ${c.name} DATA Pin BCM ${pin}`);
        } else if (c.type === 'hcsr04') {
          const pinTrig = p2 !== undefined ? p2 : 23;
          const pinEcho = p3 !== undefined ? p3 : 24;
          setupLines.push(`    GPIO.setup(${pinTrig}, GPIO.OUT) # Trig\n    GPIO.setup(${pinEcho}, GPIO.IN) # Echo`);
          loopLines.push(`        # Trigger sonar pulser ${c.name}\n        GPIO.output(${pinTrig}, GPIO.HIGH)\n        time.sleep(0.00001)\n        GPIO.output(${pinTrig}, GPIO.LOW)\n        while GPIO.input(${pinEcho}) == 0:\n            pulse_start = time.time()\n        while GPIO.input(${pinEcho}) == 1:\n            pulse_end = time.time()\n        distance = (pulse_end - pulse_start) * 17150\n        print(f"${c.name} distance: {distance:.1f} cm")`);
        } else if (c.type === 'servo') {
          const pin = p3 !== undefined ? p3 : 25;
          setupLines.push(`    GPIO.setup(${pin}, GPIO.OUT)\n    ${c.id}_pwm = GPIO.PWM(${pin}, 50)\n    ${c.id}_pwm.start(2.5)`);
          loopLines.push(`        # Cycle Servo angles ${c.name}\n        ${c.id}_pwm.ChangeDutyCycle(7.5)\n        time.sleep(1.0)\n        ${c.id}_pwm.ChangeDutyCycle(12.5)\n        time.sleep(1.0)\n        ${c.id}_pwm.ChangeDutyCycle(2.5)\n        time.sleep(1.0)`);
        } else if (c.type === 'relay') {
          const pin = p3 !== undefined ? p3 : 26;
          setupLines.push(`    GPIO.setup(${pin}, GPIO.OUT) # Relay`);
          loopLines.push(`        # Toggle Relay ${c.name}\n        GPIO.output(${pin}, GPIO.HIGH)\n        time.sleep(2.0)\n        GPIO.output(${pin}, GPIO.LOW)\n        time.sleep(2.0)`);
        } else if (c.type === 'buzzer') {
          const pin = p1 !== undefined ? p1 : 5;
          setupLines.push(`    GPIO.setup(${pin}, GPIO.OUT) # Buzzer`);
          loopLines.push(`        # Beep ${c.name}\n        GPIO.output(${pin}, GPIO.HIGH)\n        time.sleep(0.2)\n        GPIO.output(${pin}, GPIO.LOW)\n        time.sleep(0.8)`);
        } else if (c.type === 'l298n') {
          const pinIN1 = p2 !== undefined ? p2 : 5;
          const pinIN2 = p3 !== undefined ? p3 : 6;
          const pinIN3 = p4 !== undefined ? p4 : 12;
          const pinIN4 = p5 !== undefined ? p5 : 13;
          setupLines.push(`    GPIO.setup(${pinIN1}, GPIO.OUT)\n    GPIO.setup(${pinIN2}, GPIO.OUT)\n    GPIO.setup(${pinIN3}, GPIO.OUT)\n    GPIO.setup(${pinIN4}, GPIO.OUT)`);
          loopLines.push(`        # Drive ${c.name} forward\n        GPIO.output(${pinIN1}, GPIO.HIGH)\n        GPIO.output(${pinIN2}, GPIO.LOW)\n        GPIO.output(${pinIN3}, GPIO.HIGH)\n        GPIO.output(${pinIN4}, GPIO.LOW)\n        time.sleep(2.0)\n        GPIO.output(${pinIN1}, GPIO.LOW)\n        GPIO.output(${pinIN3}, GPIO.LOW)`);
        } else {
          setupLines.push(`    # Setup pins for ${c.name}`);
        }
      });

      if (setupLines.length === 0) {
        setupLines.push('    # Connect accessories on the visual canvas grid to see classic RPi.GPIO setups here');
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

      componentInstances.forEach(c => {
        const p1 = c.pins['1']?.bcm;
        const p2 = c.pins['2']?.bcm;
        const p3 = c.pins['3']?.bcm;
        const p4 = c.pins['4']?.bcm;
        const p5 = c.pins['5']?.bcm;

        if (c.type === 'led') {
          const pin = p1 !== undefined ? p1 : 17;
          setupLines.push(`  pinMode(${pin}, OUTPUT); // ${c.name}`);
          loopLines.push(`    // Blink ${c.name}\n    digitalWrite(${pin}, HIGH);\n    delay(500);\n    digitalWrite(${pin}, LOW);\n    delay(500);`);
        } else if (c.type === 'button') {
          const pin = p1 !== undefined ? p1 : 18;
          setupLines.push(`  pinMode(${pin}, INPUT);\n  pullUpDnControl(${pin}, PUD_UP); // ${c.name}`);
          loopLines.push(`    // Read Button ${c.name}\n    if (digitalRead(${pin}) == LOW) {\n        std::cout << "${c.name} Pressed!" << std::endl;\n        delay(200);\n    }`);
        } else if (c.type === 'rotary') {
          const pinA = p1 !== undefined ? p1 : 17;
          const pinB = p2 !== undefined ? p2 : 18;
          const pinSW = p3 !== undefined ? p3 : 27;
          setupLines.push(`  pinMode(${pinA}, INPUT);\n  pullUpDnControl(${pinA}, PUD_UP);\n  pinMode(${pinB}, INPUT);\n  pullUpDnControl(${pinB}, PUD_UP);\n  pinMode(${pinSW}, INPUT);\n  pullUpDnControl(${pinSW}, PUD_UP); // ${c.name}`);
          loopLines.push(`    // Read SW click for ${c.name}\n    if (digitalRead(${pinSW}) == LOW) {\n        std::cout << "${c.name} Clicked!" << std::endl;\n        delay(200);\n    }`);
        } else if (c.type === 'hcsr04') {
          const pinTrig = p2 !== undefined ? p2 : 23;
          const pinEcho = p3 !== undefined ? p3 : 24;
          setupLines.push(`  pinMode(${pinTrig}, OUTPUT);\n  pinMode(${pinEcho}, INPUT); // Trig/Echo`);
          loopLines.push(`    // Trigger HC-SR04 sonar pulse\n    digitalWrite(${pinTrig}, HIGH);\n    delayMicroseconds(10);\n    digitalWrite(${pinTrig}, LOW);\n    while(digitalRead(${pinEcho}) == LOW);\n    long start_time = micros();\n    while(digitalRead(${pinEcho}) == HIGH);\n    long travel_time = micros() - start_time;\n    int dist = travel_time / 58;\n    std::cout << "${c.name} Distance: " << dist << " cm" << std::endl;\n    delay(100);`);
        } else if (c.type === 'servo') {
          const pin = p3 !== undefined ? p3 : 25;
          setupLines.push(`  pinMode(${pin}, PWM_OUTPUT);\n  pwmSetMode(PWM_MODE_MS);\n  pwmSetClock(192);\n  pwmSetRange(2000); // 50Hz PWM for servo control`);
          loopLines.push(`    // Cycle Servo position for ${c.name}\n    pwmWrite(${pin}, 150); // 90 degrees\n    delay(1000);\n    pwmWrite(${pin}, 250); // 180 degrees\n    delay(1000);\n    pwmWrite(${pin}, 50);  // 0 degrees\n    delay(1000);`);
        } else if (c.type === 'relay') {
          const pin = p3 !== undefined ? p3 : 26;
          setupLines.push(`  pinMode(${pin}, OUTPUT); // Relay Control`);
          loopLines.push(`    // Toggle Relay ${c.name}\n    digitalWrite(${pin}, HIGH);\n    delay(2000);\n    digitalWrite(${pin}, LOW);\n    delay(2000);`);
        } else if (c.type === 'buzzer') {
          const pin = p1 !== undefined ? p1 : 5;
          setupLines.push(`  pinMode(${pin}, OUTPUT); // Buzzer pin`);
          loopLines.push(`    // Cycle sound beep for ${c.name}\n    digitalWrite(${pin}, HIGH);\n    delay(200);\n    digitalWrite(${pin}, LOW);\n    delay(800);`);
        } else if (c.type === 'l298n') {
          const pinIN1 = p2 !== undefined ? p2 : 5;
          const pinIN2 = p3 !== undefined ? p3 : 6;
          const pinIN3 = p4 !== undefined ? p4 : 12;
          const pinIN4 = p5 !== undefined ? p5 : 13;
          setupLines.push(`  pinMode(${pinIN1}, OUTPUT);\n  pinMode(${pinIN2}, OUTPUT);\n  pinMode(${pinIN3}, OUTPUT);\n  pinMode(${pinIN4}, OUTPUT);`);
          loopLines.push(`    // Cycle L298N motors forward\n    digitalWrite(${pinIN1}, HIGH);\n    digitalWrite(${pinIN2}, LOW);\n    digitalWrite(${pinIN3}, HIGH);\n    digitalWrite(${pinIN4}, LOW);\n    delay(2000);\n    digitalWrite(${pinIN1}, LOW);\n    digitalWrite(${pinIN3}, LOW);`);
        } else {
          setupLines.push(`  // Configurations for ${c.name}`);
        }
      });

      if (setupLines.length === 0) {
        setupLines.push('  // Connect accessories on the visual canvas grid to see C++ setups here');
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
