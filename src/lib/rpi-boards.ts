export interface PinInfo {
  physical: number;
  bcm: number | null; // null for power/GND
  function: string;
  notes?: string;
  type: 'power3v3' | 'power5v' | 'gnd' | 'gpio' | 'special' | 'adc';
}

export interface BoardDefinition {
  id: string;
  name: string;
  type: 'sbc' | 'mcu';
  image_placeholder: string;
  pins: PinInfo[];
}

// Standard RPi 40-Pin Header layout (Pi 3B+, Pi 4B, Pi 5, Zero 2W, CM4 IO)
export const RPI_40PIN_HEADER: PinInfo[] = [
  { physical: 1, bcm: null, function: '3.3V Power', type: 'power3v3' },
  { physical: 2, bcm: null, function: '5V Power', type: 'power5v' },
  { physical: 3, bcm: 2, function: 'SDA1 (I2C)', notes: '1.8kΩ pull-up', type: 'gpio' },
  { physical: 4, bcm: null, function: '5V Power', type: 'power5v' },
  { physical: 5, bcm: 3, function: 'SCL1 (I2C)', notes: '1.8kΩ pull-up', type: 'gpio' },
  { physical: 6, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 7, bcm: 4, function: 'GPCLK0', type: 'gpio' },
  { physical: 8, bcm: 14, function: 'TXD (UART)', type: 'gpio' },
  { physical: 9, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 10, bcm: 15, function: 'RXD (UART)', type: 'gpio' },
  { physical: 11, bcm: 17, function: 'GPIO17', type: 'gpio' },
  { physical: 12, bcm: 18, function: 'GPIO18 / PWM0', notes: 'PWM0', type: 'gpio' },
  { physical: 13, bcm: 27, function: 'GPIO27', type: 'gpio' },
  { physical: 14, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 15, bcm: 22, function: 'GPIO22', type: 'gpio' },
  { physical: 16, bcm: 23, function: 'GPIO23', type: 'gpio' },
  { physical: 17, bcm: null, function: '3.3V Power', type: 'power3v3' },
  { physical: 18, bcm: 24, function: 'GPIO24', type: 'gpio' },
  { physical: 19, bcm: 10, function: 'MOSI (SPI0)', type: 'gpio' },
  { physical: 20, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 21, bcm: 9, function: 'MISO (SPI0)', type: 'gpio' },
  { physical: 22, bcm: 25, function: 'GPIO25', type: 'gpio' },
  { physical: 23, bcm: 11, function: 'SCLK (SPI0)', type: 'gpio' },
  { physical: 24, bcm: 8, function: 'CE0 (SPI0)', type: 'gpio' },
  { physical: 25, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 26, bcm: 7, function: 'CE1 (SPI0)', type: 'gpio' },
  { physical: 27, bcm: 0, function: 'ID_SD (EEPROM)', notes: 'HAT EEPROM', type: 'special' },
  { physical: 28, bcm: 1, function: 'ID_SC (EEPROM)', notes: 'HAT EEPROM', type: 'special' },
  { physical: 29, bcm: 5, function: 'GPIO5', type: 'gpio' },
  { physical: 30, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 31, bcm: 6, function: 'GPIO6', type: 'gpio' },
  { physical: 32, bcm: 12, function: 'GPIO12 / PWM0', type: 'gpio' },
  { physical: 33, bcm: 13, function: 'GPIO13 / PWM1', type: 'gpio' },
  { physical: 34, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 35, bcm: 19, function: 'GPIO19 / MISO1', notes: 'PCM_FS', type: 'gpio' },
  { physical: 36, bcm: 16, function: 'GPIO16 / CE0_1', type: 'gpio' },
  { physical: 37, bcm: 26, function: 'GPIO26', type: 'gpio' },
  { physical: 38, bcm: 20, function: 'GPIO20 / MOSI1', notes: 'PCM_DIN', type: 'gpio' },
  { physical: 39, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 40, bcm: 21, function: 'GPIO21 / SCLK1', notes: 'PCM_DOUT', type: 'gpio' }
];

// Raspberry Pi Pico 40-Pin Layout
export const RPI_PICO_HEADER: PinInfo[] = [
  { physical: 1, bcm: 0, function: 'GP0 / UART0_TX / I2C0_SDA', type: 'gpio' },
  { physical: 2, bcm: 1, function: 'GP1 / UART0_RX / I2C0_SCL', type: 'gpio' },
  { physical: 3, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 4, bcm: 2, function: 'GP2 / I2C1_SDA', type: 'gpio' },
  { physical: 5, bcm: 3, function: 'GP3 / I2C1_SCL', type: 'gpio' },
  { physical: 6, bcm: 4, function: 'GP4 / UART1_TX', type: 'gpio' },
  { physical: 7, bcm: 5, function: 'GP5 / UART1_RX', type: 'gpio' },
  { physical: 8, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 9, bcm: 6, function: 'GP6 / I2C1_SDA', type: 'gpio' },
  { physical: 10, bcm: 7, function: 'GP7 / I2C1_SCL', type: 'gpio' },
  { physical: 11, bcm: 8, function: 'GP8 / SPI0_RX', type: 'gpio' },
  { physical: 12, bcm: 9, function: 'GP9 / SPI0_CS', type: 'gpio' },
  { physical: 13, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 14, bcm: 10, function: 'GP10 / SPI0_SCK', type: 'gpio' },
  { physical: 15, bcm: 11, function: 'GP11 / SPI0_TX', type: 'gpio' },
  { physical: 16, bcm: 12, function: 'GP12 / I2C0_SDA', type: 'gpio' },
  { physical: 17, bcm: 13, function: 'GP13 / I2C0_SCL', type: 'gpio' },
  { physical: 18, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 19, bcm: 14, function: 'GP14 / SPI1_RX', type: 'gpio' },
  { physical: 20, bcm: 15, function: 'GP15 / SPI1_CS', type: 'gpio' },
  
  // Right side from bottom to top
  { physical: 21, bcm: 16, function: 'GP16 / SPI0_RX', type: 'gpio' },
  { physical: 22, bcm: 17, function: 'GP17 / SPI0_CS', type: 'gpio' },
  { physical: 23, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 24, bcm: 18, function: 'GP18 / SPI0_SCK', type: 'gpio' },
  { physical: 25, bcm: 19, function: 'GP19 / SPI0_TX', type: 'gpio' },
  { physical: 26, bcm: 20, function: 'GP20 / I2C0_SDA', type: 'gpio' },
  { physical: 27, bcm: 21, function: 'GP21 / I2C0_SCL', type: 'gpio' },
  { physical: 28, bcm: null, function: 'Ground', type: 'gnd' },
  { physical: 29, bcm: 22, function: 'GP22', type: 'gpio' },
  { physical: 30, bcm: null, function: 'RUN (Reset)', type: 'special' },
  { physical: 31, bcm: 26, function: 'GP26 / ADC0', type: 'adc' },
  { physical: 32, bcm: 27, function: 'GP27 / ADC1', type: 'adc' },
  { physical: 33, bcm: null, function: 'AGND (Analog Ground)', type: 'gnd' },
  { physical: 34, bcm: 28, function: 'GP28 / ADC2', type: 'adc' },
  { physical: 35, bcm: null, function: 'ADC_VREF', type: 'special' },
  { physical: 36, bcm: null, function: '3V3(OUT) / Power Out', type: 'power3v3' },
  { physical: 37, bcm: null, function: '3V3_EN / Power Enable', type: 'special' },
  { physical: 38, bcm: null, function: 'GND / Ground', type: 'gnd' },
  { physical: 39, bcm: null, function: 'VSYS / Power In (1.8-5.5V)', type: 'power5v' },
  { physical: 40, bcm: null, function: 'VBUS / USB Power (5V)', type: 'power5v' }
];

export const BOARDS: BoardDefinition[] = [
  {
    id: 'rpi5',
    name: 'Raspberry Pi 5',
    type: 'sbc',
    image_placeholder: '🍓 RPi 5',
    pins: RPI_40PIN_HEADER
  },
  {
    id: 'rpi4b',
    name: 'Raspberry Pi 4 Model B',
    type: 'sbc',
    image_placeholder: '🍓 RPi 4B',
    pins: RPI_40PIN_HEADER
  },
  {
    id: 'rpi-zero2w',
    name: 'Raspberry Pi Zero 2 W',
    type: 'sbc',
    image_placeholder: '🍓 Zero 2W',
    pins: RPI_40PIN_HEADER
  },
  {
    id: 'rpi3b-plus',
    name: 'Raspberry Pi 3 Model B+',
    type: 'sbc',
    image_placeholder: '🍓 RPi 3B+',
    pins: RPI_40PIN_HEADER
  },
  {
    id: 'rpi-cm4',
    name: 'Raspberry Pi Compute Module 4 (IO)',
    type: 'sbc',
    image_placeholder: '🍓 CM4 IO',
    pins: RPI_40PIN_HEADER
  },
  {
    id: 'rpi-pico',
    name: 'Raspberry Pi Pico',
    type: 'mcu',
    image_placeholder: '⚡ Pico',
    pins: RPI_PICO_HEADER
  },
  {
    id: 'rpi-pico-w',
    name: 'Raspberry Pi Pico W',
    type: 'mcu',
    image_placeholder: '⚡ Pico W',
    pins: RPI_PICO_HEADER
  }
];

export function getBoardById(id: string): BoardDefinition | undefined {
  return BOARDS.find(b => b.id === id);
}
