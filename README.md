# NeoWork - Developer Workspace Orchestrator

<div align="center">

  <img src="resources/icon-matrix-minimal.svg" alt="NeoWork Logo" width="96" height="96" />

  <h3>A modern workspace orchestrator, terminal dashboard, and mobile companion for developers</h3>

  <p>
    Launch, organize, and monitor multiple terminals, background services, and development processes in parallel with real-time telemetry, an infinite canvas board, and a remote mobile companion.
  </p>

  <p>
    <a href="https://github.com/neukkken/neo-workspace/releases"><img src="https://img.shields.io/badge/Release-v1.7.2-emerald?style=flat-square&logo=electron" alt="Version" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License" /></a>
    <a href="#"><img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-zinc?style=flat-square&logo=linux" alt="Cross-Platform" /></a>
    <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" /></a>
  </p>
</div>

---

## Open Source Project

**NeoWork is free and open-source software** distributed under the terms of the **MIT License**.

Built around developer-first principles:
- **Local-first and Private:** All configurations, scripts, and directories stay strictly on your local machine. No third-party tracking, external servers, or remote telemetry.
- **No Vendor Lock-in:** Fork, audit, extend, or customize any module freely.
- **Community-Driven:** Contributions, feature proposals, and feedback from developers worldwide are welcomed and encouraged.

---

## Downloads and Installation

Precompiled binary packages are available directly from the **[Releases](https://github.com/neukkken/neo-workspace/releases)** page:

### Windows
- **Setup Installer:** `NeoWork-Setup-1.7.2.exe` (Recommended for automatic updates and desktop shortcuts).
- **Portable Executable:** `NeoWork-1.7.2-portable.exe` (Run directly without installation or administrator privileges).

### Linux
- **Universal AppImage:** `NeoWork-1.7.2.AppImage` (Runs on all modern Linux distributions).
  ```bash
  chmod +x NeoWork-1.7.2.AppImage
  ./NeoWork-1.7.2.AppImage
  ```
- **Debian / Ubuntu Package:** `NeoWork_1.7.2_amd64.deb`
  ```bash
  sudo dpkg -i NeoWork_1.7.2_amd64.deb
  ```

---

## Key Features

### 1. Multi-Workspace Management (Sidebar Launchpad)
- Create, edit, and organize isolated development workspaces per project.
- Each workspace persists its own terminal grid layout, startup commands, and working directories (`cwd`).
- Seamless local storage with clean JSON schema and instant workspace switching.

### 2. Native Interactive Pseudo-Terminals (PTY)
- Native engine powered by `node-pty` and `@xterm/xterm` (v6) with full 24-bit TrueColor ANSI support.
- Fully interactive execution: handles `Ctrl+C`, interactive confirmation prompts (`y/n`), Git interactive rebases, Docker, Vite, and development CLI tools.
- Integrated search addon (`@xterm/addon-search`) and clickable terminal URLs (`@xterm/addon-web-links`).
- Clean clipboard integration with automatic duplicate paste prevention.
- Dynamic terminal reflow via `FitAddon` on window resize.

### 3. Infinite Free-Form Canvas Mode (Whiteboard)
- Switch seamlessly between the classical structured Grid and the free-form Infinite Board (`Ctrl + Shift + F`).
- Smooth pan and zoom (30% to 220%) with cursor-anchored scaling.
- Freely place, drag, resize, and organize multi-type cards:
  - **Console Cards:** Spawn independent persistent terminals running in your project directory.
  - **Embedded Web Browsers:** Real-time local web development previews (`http://localhost:5173`, etc.) with URL navigation, reload, and responsive presets.
  - **Sticky Notes:** Quick scratchpads and todo lists saved directly with your workspace.
  - **File Explorer Cards:** Browse directory trees, view code syntax, preview images, and inspect spreadsheet tables.
  - **Port Monitors:** Live status tracking for active local network ports.

### 4. Mobile Companion & Remote Gateway
- Pair your smartphone or tablet with your desktop over local Wi-Fi via a secure QR code or local PIN.
- Zero app installation required: works in any modern mobile browser.
- **Remote AI Prompt Bar:** Trigger prompts directly into running AI coding agents (Claude, Gemini, Antigravity, Aider, OpenCode) from your phone while away from your desk.
- **Touch-Friendly Terminal Monitor:** Smooth touch-swipe scrolling and clean ANSI terminal log viewing on mobile displays.
- Quick action controls (Enter, Ctrl+C, Clear) and real-time CPU/RAM telemetry right on your mobile screen.

### 5. Command Palette (`Ctrl + P` / `Ctrl + K`)
- Fast keyboard-centric navigation across your entire environment.
- Switch workspaces instantly, toggle between Grid and Canvas modes, spawn cards, trigger settings, or search available commands.

### 6. Integrated File Explorer & Excel Viewer
- Browse project files with smart file icons and hidden file filtering.
- Full spreadsheet preview support (`.xlsx`, `.xls`, `.csv`) with tabulated sheet viewer, search filter, and "Open in System App" shortcut.
- Embedded preview for Markdown, JSON, source code, and images.

### 7. Real-Time Telemetry & Process Monitoring
- Live **CPU %** and **RAM (MB)** telemetry per terminal process powered by `pidusage`.
- Aggregated workspace and system load monitoring displayed dynamically in the title bar.

### 8. Built-in Silent Auto-Updater
- Integrated with GitHub Releases via `electron-updater`.
- Checks for updates automatically and notifies you with a non-intrusive toast to download and apply the latest version when ready.

### 9. Keyboard Shortcuts System
- Complete keyboard control for workspace navigation, layout toggling, process restarts, and terminal buffers.
- Press `?` or click the shortcuts icon in the header to view the full interactive hotkey reference.

---

## Visual Identity and Icon Options

NeoWork includes minimal design assets tailored for development tools:

| Option | Name | Concept | Asset File |
| :---: | :---: | :--- | :--- |
| **A** | **Matrix Minimal (Active)** | Matte carbon squircle featuring a luminous emerald terminal prompt glyph (`>_`). | [`resources/icon-matrix-minimal.svg`](resources/icon-matrix-minimal.svg) |
| **B** | **Neo Grid** | Minimal geometric 2x2 grid representing workspace nodes and telemetry states. | [`resources/icon-neo-grid.svg`](resources/icon-neo-grid.svg) |
| **C** | **Neo Monogram** | Stylized letter 'N' composed of terminal chevrons and cursor pillars. | [`resources/icon-neo-monogram.svg`](resources/icon-neo-monogram.svg) |

---

## Local Development

To run or build the project from source:

### Prerequisites
- [Node.js](https://nodejs.org/) (version 20+ recommended)
- `npm` or `pnpm`
- C++ build tools for compiling `node-pty`:
  - **Linux (Ubuntu/Debian/Fedora):** `sudo apt install build-essential python3` / `sudo dnf groupinstall "Development Tools"`
  - **Windows:** Visual Studio C++ build tools

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/neukkken/neo-workspace.git
   cd neo-workspace
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode (with HMR):**
   ```bash
   npm run dev
   ```

4. **Run TypeScript type verification:**
   ```bash
   npm run typecheck
   ```

5. **Build bundle:**
   ```bash
   npm run build
   ```

6. **Package executables locally:**
   ```bash
   # Package for current host OS:
   npm run dist

   # Windows target:
   npm run dist:win

   # Linux target:
   npm run dist:linux
   ```

---

## Project Architecture

```
neo-workspace/
├── .github/
│   └── workflows/
│       └── release.yml             # Multi-platform CI/CD for Windows & Linux
├── build/                          # App packaging icons (.png, .ico)
├── resources/                      # Vector design assets (SVG)
├── src/
│   ├── main/
│   │   ├── index.ts                # Electron main process & window management
│   │   ├── pty-manager.ts          # Native PTY orchestration (node-pty)
│   │   ├── remote-gateway.ts       # Mobile Companion HTTP & WebSocket server
│   │   ├── store.ts                # Workspace JSON persistence
│   │   ├── telemetry.ts            # Process telemetry monitor (pidusage)
│   │   └── updater.ts              # In-app GitHub auto-updater service
│   ├── preload/
│   │   ├── index.ts                # Secure ContextBridge IPC layer
│   │   └── index.d.ts              # TypeScript definitions for window.neoAPI
│   └── renderer/
│       ├── index.html              # HTML root with developer font stacks
│       └── src/
│           ├── main.tsx            # React entry point
│           ├── App.tsx             # Root component and state synchronization
│           ├── types.ts            # Shared TypeScript schemas
│           ├── components/         # UI components
│           │   ├── BrowserCard.tsx         # Embedded browser card for Canvas
│           │   ├── CanvasWorkspace.tsx     # Infinite whiteboard workspace
│           │   ├── CommandPaletteModal.tsx # Command palette (Ctrl+K / Ctrl+P)
│           │   ├── FileExplorerCard.tsx    # File explorer & spreadsheet viewer
│           │   ├── Launchpad.tsx           # Sidebar workspace switcher
│           │   ├── MobileConnectModal.tsx  # QR code pairing modal
│           │   ├── NoteCard.tsx            # Sticky notes card
│           │   ├── PortMonitorCard.tsx     # Active network port monitor
│           │   ├── SettingsModal.tsx       # App and gateway preferences
│           │   ├── ShortcutsModal.tsx      # Hotkeys cheat-sheet
│           │   ├── StatusBar.tsx           # Telemetry and gateway indicator
│           │   ├── TerminalCanvasCard.tsx  # Floating terminal node on Canvas
│           │   ├── TerminalGrid.tsx        # Structured multi-panel terminal grid
│           │   ├── TerminalPanel.tsx       # Grid terminal panel container
│           │   ├── TitleBar.tsx            # Title bar with system metrics & quick tools
│           │   ├── UpdateNotificationToast.tsx # Silent updater alert
│           │   ├── WorkspaceHeader.tsx     # Workspace controls & breadcrumbs
│           │   ├── WorkspaceModal.tsx      # Workspace editor modal
│           │   └── XTermView.tsx           # xterm.js instance with search & web-links
│           └── styles/
│               └── index.css       # Tailwind CSS definitions
├── electron.vite.config.ts         # Bundling configuration (Electron + Vite)
├── electron-builder.json           # Cross-platform installer specifications
├── LICENSE                         # MIT Open Source License
└── package.json
```

---

## Contributing

Contributions are welcome. To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/your-feature-name`).
3. Commit your changes using conventional commit style (`git commit -m 'feat: describe change'`).
4. Push to your branch (`git push origin feat/your-feature-name`).
5. Open a Pull Request against `master`.

---

## License

This project is licensed under the terms of the **MIT License**. See the [LICENSE](LICENSE) file for details.
