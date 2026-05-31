# PiForge

> **Visual project planning, engineered for Raspberry Pi.**  
> *Free, fully offline, and open-source desktop planner for RPi boards and GPIO wiring accessories.*

---

PiForge sits at the intersection of **hardware wiring, sprint planning, and system dependencies visualization** — combining the wiring clarity of Fritzing, the sprint tracking efficiency of Linear, and the infinite visual design freedom of Excalidraw into a single offline-first workspace.

---

## 🎨 Features & Capabilities

- 🍉 **Interactive SVG Canvas**: An infinite panning and zooming stage. Drag-and-drop Raspberry Pi motherboard diagrams (Pi 5, 4B, Zero 2W, Pico, Pico W, etc.) and click individual pin headers to draw curved vector wires to sensors, relays, and OLED displays.
- 🛡️ **Real-Time Hardware Diagnostics**: An on-canvas schematic validator that alerts you to:
  - **GPIO Pin Conflicts**: Triggering warnings when multiple accessories are wired to the same physical pin.
  - **Power Mismatch Errors**: Warning if a 5V high-torque actuator (e.g. SG90 Servo, Relay) is incorrectly powered by a 3.3V rail.
- 💻 **Firmware Code Scaffolding**: Cross-compiles physical visual wiring directly into ready-to-run scripts.
  - **Supported Standards**: Python (`gpiozero` OOP, `RPi.GPIO` classic) and C++ (`WiringPi`).
  - **Broad Catalog Coverage**: Generates pin-accurate setups and operations for **all 13 built-in accessories**—including LEDs, Push Buttons, Rotary Encoders, DHT22 sensors, HC-SR04 sonars, SG90 servos, Relays, Buzzers, I2C OLED screens, Character LCD1602 screens, L298N H-bridges, MCP3008 ADCs, and DS18B20 1-Wire temperature sensors.
- 📋 **Tactile Sprint Kanban**: Columns dashboard utilizing native HTML5 drag-and-drop card trackers. Click a sprint card to access checklist task properties, timeline estimates, and calendars.
- 📝 **Tabular Tasks Ledger**: Spreadsheet-like ledger with instant inline priority adjustments and filter widgets.
- 🕸️ **Force-Directed Graph**: Uses `Cytoscape.js` to map your project's components and tasks as relational nodes, illustrating hardware layouts and software sprint blocks at a glance.
- 📚 **Sanitized Documentation Editor**: Markdown notes compiler that uses a split-pane layout to show HTML previews sanitized by `DOMPurify`.
- 📊 **Bill of Materials Generator**: Aggregates all canvas sensors to auto-generate a component list printable as vector PDFs or shared as Excel CSV sheets.
- 🔒 **Off-Grid Sovereign Security**: Completely offline and privacy-first.
  - Locks down scripts with a strict Content Security Policy (CSP) blocking external frames or script execution.
  - Features a 100% clean audit pass (**0 vulnerabilities found** via dependency checks and **0 warnings** via strict Rust `clippy` static analysis).
- 📦 **Local Portability (.piforge)**: Completely offline. Imports and exports self-contained sharing JSON archives representing your entire workspace.

---

## ⚙️ Technology Stack

- **Desktop Shell**: [Tauri v2.x](https://v2.tauri.app/) (Rust-based system IPC & tray orchestration)
- **Frontend Compiler**: [SvelteKit v2.x](https://kit.svelte.dev/) in Single-Page Application (SPA) mode
- **Reactive Engine**: Svelte 5 (reactive stores & components bindings)
- **Styling Compilation**: [Tailwind CSS v4.x](https://tailwindcss.com/)
- **Local Persistence**: Offline SQLite database file via native Rust `rusqlite`
- **Dependency Graph**: [Cytoscape.js](https://js.cytoscape.org/)

---

## 🚀 Dev Setup (macOS Apple Silicon)

Follow these simple instructions to initialize the developer environment:

### 1. Install System Dependencies
Install Node.js 20+, Rust toolchains, and package managers via Homebrew:
```bash
# Install Homebrew if missing
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node & package manager
brew install node@20 pnpm git

# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
rustup default stable
rustup target add aarch64-apple-darwin
```

### 2. Scaffold and Run Development Servers

Clone the repo, install packages, and boot up:
```bash
# Clone the repository
git clone https://github.com/pallab-js/PiForge.git
cd PiForge

# Install frontend libraries
pnpm install
```

To run a **lightweight mockup browser server** (great for rapid UI checking using `localStorage` fallbacks):
```bash
pnpm dev
# Opens http://localhost:5173
```

To launch the **native Tauri desktop app** (using the SQLite database inside application support):
```bash
pnpm tauri dev
```

---

## 📦 Bundling & Packaging

Compile the static client-side distribution folder and trigger the Tauri compiler to package native binary installers (e.g. `.dmg` on macOS, `.msi` on Windows, or `.AppImage` on Linux):
```bash
pnpm build
pnpm tauri build
```

---

## 📄 License

Distributed under the terms of the MIT License. See [LICENSE](LICENSE) for more details.
