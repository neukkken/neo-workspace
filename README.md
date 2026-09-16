# NeoWork - Developer Workspace Orchestrator

<div align="center">

  <img src="resources/icon-matrix-minimal.svg" alt="NeoWork Logo" width="96" height="96" />

  <h3>A modern workspace orchestrator and terminal dashboard for developers</h3>

  <p>
    Launch, organize, and monitor multiple terminals, background services, and development processes in parallel with real-time telemetry.
  </p>

  <p>
    <a href="https://github.com/neukkken/neo-workspace/releases"><img src="https://img.shields.io/badge/Release-v1.3.1-emerald?style=flat-square&logo=electron" alt="Version" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License" /></a>
    <a href="#"><img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-zinc?style=flat-square&logo=linux" alt="Cross-Platform" /></a>
    <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" /></a>
  </p>
</div>

---

## Open Source Project

**NeoWork is free and open-source software** distributed under the terms of the **MIT License**.

Built around developer-first principles:
- **Local-first and Private:** All configurations, scripts, and directories stay strictly on your local machine. No remote tracking or telemetry servers.
- **No Vendor Lock-in:** Fork, audit, extend, or customize any module freely.
- **Community-Driven:** Contributions, feature proposals, and feedback from developers worldwide are welcomed and encouraged.

---

## Downloads and Installation

Precompiled binary packages are available directly from the **[Releases](https://github.com/neukkken/neo-workspace/releases)** page:

### Windows
- **Setup Installer:** `NeoWork-Setup-1.3.1.exe` (Recommended for automatic updates and desktop shortcuts).
- **Portable Executable:** `NeoWork-1.3.1-portable.exe` (Run directly without installation or administrator privileges).

### Linux
- **Universal AppImage:** `NeoWork-1.3.1.AppImage` (Runs on modern Linux distributions).
  ```bash
  chmod +x NeoWork-1.3.1.AppImage
  ./NeoWork-1.3.1.AppImage
  ```
- **Debian / Ubuntu Package:** `NeoWork_1.3.1_amd64.deb`
  ```bash
  sudo dpkg -i NeoWork_1.3.1_amd64.deb
  ```

---

## Key Features

1. **Multi-Workspace Management (Sidebar Launchpad):**
   - Create, edit, and organize isolated development workspaces per project.
   - Each workspace persists its own terminal grid layout, startup commands, and working directories (`cwd`).
   - Automatic local storage using clean JSON schema.

2. **Native Interactive Pseudo-Terminals (PTY):**
   - Native engine powered by `node-pty` and `xterm.js` with full 24-bit TrueColor ANSI support.
   - Fully interactive execution: handles `Ctrl+C`, confirmation prompts (`y/n`), interactive Git commands, Docker, Vite, and development CLI tools.
   - Dynamic terminal reflow via `FitAddon` on window resize.

3. **Visual Directory Picker:**
   - Type paths manually or use the native OS folder dialog to select workspace roots without typographical errors.

4. **Automated Process Execution:**
   - Define custom startup commands per panel (e.g., `npm run dev`, `docker compose up`, `python agent.py`).
   - Toggle auto-execution per terminal on demand.

5. **Real-Time Telemetry:**
   - Live **CPU %** and **RAM (MB)** usage tracking per terminal process powered by `pidusage`.
   - Aggregated workspace and system load monitoring displayed in the title bar.

6. **Quick Action Controls:**
   - **Restart:** Instantly restart the assigned process.
   - **Clear:** Flush terminal scrollback buffer.
   - **Maximize / Restore:** Expand any terminal panel to full view for inspecting deep stack traces or long build logs, then return to the grid with one click.
   - **Copy Path:** Copy the panel's active directory to clipboard.

7. **Clean Developer Interface:**
   - Dark graphite and zinc theme (`#090a0c`) designed to reduce visual fatigue.
   - Subtle emerald accents (`#10b981`) and developer typography (`Inter` and `JetBrains Mono`).

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
  - **Linux (Ubuntu/Debian):** `sudo apt install build-essential python3`
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
│       └── release.yml        # Multi-platform CI/CD for Windows & Linux
├── build/                     # App packaging icons (.png, .ico)
├── resources/                 # Vector design assets (SVG)
├── src/
│   ├── main/
│   │   ├── index.ts           # Electron main process & window management
│   │   ├── pty-manager.ts     # Native PTY orchestration (node-pty)
│   │   ├── store.ts           # Workspace JSON persistence
│   │   └── telemetry.ts       # Process telemetry monitor (pidusage)
│   ├── preload/
│   │   ├── index.ts           # Secure ContextBridge IPC layer
│   │   └── index.d.ts         # TypeScript definitions for window.neoAPI
│   └── renderer/
│       ├── index.html         # HTML root with developer font stacks
│       └── src/
│           ├── main.tsx       # React entry point
│           ├── App.tsx        # Root component and state synchronization
│           ├── types.ts       # Shared TypeScript schemas
│           ├── components/    # UI components (TerminalGrid, Launchpad, etc.)
│           └── styles/
│               └── index.css  # Tailwind CSS definitions
├── electron.vite.config.ts    # Bundling configuration (Electron + Vite)
├── electron-builder.json      # Cross-platform installer specifications
├── LICENSE                    # MIT Open Source License
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
