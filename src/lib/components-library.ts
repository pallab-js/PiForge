import type { LibraryComponent } from './types';

export const BUILTIN_COMPONENTS: LibraryComponent[] = [
  {
    id: 'led',
    name: 'LED (Standard)',
    description: 'Light Emitting Diode. Requires a resistor (e.g. 220Ω) in series. Connect anode (long leg) to GPIO and cathode (short leg) to GND.',
    category: 'gpio',
    pin_count: 2,
    icon_svg: '🔴',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'button',
    name: 'Push Button',
    description: 'Tactile momentary switch. Connects one pin to GPIO and another to GND. Use internal pull-up resistors in software.',
    category: 'gpio',
    pin_count: 2,
    icon_svg: '🔘',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'rotary',
    name: 'Rotary Encoder',
    description: 'Incremental rotary encoder with integrated push switch. Used to sense rotation direction, speed, and clicks.',
    category: 'gpio',
    pin_count: 5,
    icon_svg: '🔄',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'dht22',
    name: 'DHT22 Temp/Humidity',
    description: 'Digital relative temperature and humidity sensor. Uses a custom single-wire serial protocol. Needs 3.3V power.',
    category: 'sensors',
    pin_count: 4,
    icon_svg: '🌡️',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'hcsr04',
    name: 'HC-SR04 Ultrasonic',
    description: 'Ultrasonic distance sensor. Generates a pulse to trigger and measures the echo duration. Needs 5V power and a voltage divider for echo pin (5V to 3.3V).',
    category: 'sensors',
    pin_count: 4,
    icon_svg: '📏',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'servo',
    name: 'SG90 Micro Servo',
    description: 'Small 9g hobby servo motor. Controlled using PWM (Pulse Width Modulation) with a 50Hz frequency. Needs 5V power.',
    category: 'actuators',
    pin_count: 3,
    icon_svg: '⚙️',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'relay',
    name: 'Relay Module (1-Channel)',
    description: 'Electromagnetic switch allowing control of high-voltage appliances (AC/DC) from a low-voltage GPIO signal.',
    category: 'actuators',
    pin_count: 3,
    icon_svg: '🔌',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'oled',
    name: 'OLED Display (I2C)',
    description: '0.96 inch 128x64 pixels monochrome screen. Communicates via I2C protocol. Connect SDA to SDA1 and SCL to SCL1.',
    category: 'displays',
    pin_count: 4,
    icon_svg: '📺',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'lcd1602',
    name: '16x2 Character LCD',
    description: '16 columns by 2 rows character display with backlight. Commonly driven via an I2C backpack interface (PCF8574) for simple wiring.',
    category: 'displays',
    pin_count: 4,
    icon_svg: '📟',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'buzzer',
    name: 'Active/Passive Buzzer',
    description: 'Piezoelectric audio transducer. Active buzzers beep when powered; passive buzzers require an AC/PWM signal to play tones.',
    category: 'actuators',
    pin_count: 2,
    icon_svg: '🔔',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'l298n',
    name: 'L298N Motor Driver',
    description: 'H-Bridge motor driver module. Allows controlling the speed and direction of two DC motors or one stepper motor. External power recommended.',
    category: 'power',
    pin_count: 6,
    icon_svg: '🏎️',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'mcp3008',
    name: 'MCP3008 10-bit ADC',
    description: '8-channel analog-to-digital converter using SPI interface. Critical for Raspberry Pi SBCs since they lack native analog input pins.',
    category: 'communication',
    pin_count: 16,
    icon_svg: '🎛️',
    is_builtin: true,
    created_at: Date.now()
  },
  {
    id: 'ds18b20',
    name: 'DS18B20 Temperature',
    description: '1-Wire digital thermometer. Accurate, robust, and supports multiple sensors on the same bus wire. Requires a 4.7kΩ pull-up resistor.',
    category: 'sensors',
    pin_count: 3,
    icon_svg: '🌡️',
    is_builtin: true,
    created_at: Date.now()
  }
];

export function getBuiltinComponentById(id: string): LibraryComponent | undefined {
  return BUILTIN_COMPONENTS.find(c => c.id === id);
}
