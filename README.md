# NeoWork - Developer Workspace Orchestrator

<div align="center">

  <img src="resources/icon-matrix-minimal.svg" alt="NeoWork Logo" width="100" height="100" />

  <h3>La consola y orquestador de entornos de trabajo para desarrolladores</h3>

  <p>
    Ejecuta, organiza y supervisa múltiples terminales, procesos y servidores en paralelo con telemetría en tiempo real.
  </p>

  <p>
    <a href="https://github.com/neukkken/neo-workspace/releases"><img src="https://img.shields.io/badge/Release-v1.3.1-emerald?style=flat-square&logo=electron" alt="Version" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License" /></a>
    <a href="#"><img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-zinc?style=flat-square&logo=linux" alt="Cross-Platform" /></a>
    <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" /></a>
  </p>
</div>

---

## 🌟 Proyecto de Código Abierto (Open Source)

**NeoWork es un proyecto libre y de código abierto** distribuido bajo los términos de la **Licencia MIT**.

Creemos en herramientas para desarrolladores que sean:
- **Transparentes y Privadas:** Tus scripts, rutas de proyectos y variables se guardan únicamente de forma local en tu máquina.
- **Sin Bloqueos Propietarios:** Puedes auditar, bifurcar (fork), personalizar o extender cualquier módulo libremente.
- **Construidas por y para la Comunidad:** Invitamos y agradecemos las contribuciones de cualquier desarrollador alrededor del mundo.

---

## 🚀 Descarga e Instalación

Puedes descargar los binarios oficiales precompilados directamente desde la sección de **[Releases](https://github.com/neukkken/neo-workspace/releases)**:

### 🪟 Windows
- **Instalador guiado:** `NeoWork-Setup-1.3.1.exe` (Instalación automática y accesos directos).
- **Ejecutable Portable:** `NeoWork-1.3.1-portable.exe` (No requiere instalación ni privilegios de administrador).

### 🐧 Linux
- **AppImage universal:** `NeoWork-1.3.1.AppImage` (Ejecutable en cualquier distribución Linux moderna).
  ```bash
  chmod +x NeoWork-1.3.1.AppImage
  ./NeoWork-1.3.1.AppImage
  ```
- **Paquete Debian / Ubuntu:** `NeoWork_1.3.1_amd64.deb`
  ```bash
  sudo dpkg -i NeoWork_1.3.1_amd64.deb
  ```

---

## ✨ Características Principales

1. **Gestión de Múltiples Workspaces (Launchpad lateral):**
   - Crea, edita y elimina entornos de trabajo independientes por proyecto.
   - Cada workspace guarda su propia cuadrícula de terminales, comandos asignados y rutas de trabajo (`cwd`).
   - Persistencia local automática en formato JSON.

2. **Terminales Reales e Interactivas (Pseudo-terminales PTY):**
   - Motor nativo basado en `node-pty` y `xterm.js` con soporte para colores ANSI 24-bit TrueColor.
   - Totalmente interactivo: soporta `Ctrl+C`, preguntas interactivas `y/n`, comandos interactivos de Git, Vite, Docker, etc.
   - Soporta auto-ajuste de columnas y filas (`FitAddon`) al redimensionar la ventana.

3. **Selector Visual de Carpetas:**
   - Escribe la ruta manualmente o haz clic en **"Browse"** para abrir el explorador de archivos nativo de tu sistema operativo.

4. **Auto-ejecución de Procesos:**
   - Configura comandos iniciales por panel que se lanzan automáticamente al abrir el workspace (ej. `npm run dev`, `docker compose up`, `git status`).
   - Posibilidad de activar o pausar la auto-ejecución panel por panel.

5. **Telemetría en Tiempo Real:**
   - Indicador en vivo de consumo de **CPU %** y **RAM (MB)** por cada panel y terminal individual mediante `pidusage`.
   - Métricas agregadas a nivel de workspace y del sistema en la barra superior.

6. **Controles Rápidos por Panel:**
   - **Restart:** Reinicia el proceso y vuelve a ejecutar el comando configurado.
   - **Clear:** Limpia el buffer de la terminal.
   - **Maximize / Restore:** Amplía un panel al 100% de la pantalla para inspeccionar logs largos y regresa a la cuadrícula con un clic.
   - **Copy Path:** Copia rápidamente la ruta de trabajo al portapapeles del sistema.

7. **Diseño Moderno de Alto Rendimiento:**
   - Paleta oscura profesional en tonos grafito y zinc (`#090a0c`).
   - Acentos en verde esmeralda (`#10b981`), badges sutiles y tipografías para desarrolladores (`Inter` y `JetBrains Mono`).

---

## 🎨 Identidad Visual y Opciones de Iconos

NeoWork incluye varias propuestas de diseño minimalistas diseñadas para encajar en entornos modernos:

| Opción | Nombre | Concepto Visual | Archivo |
| :---: | :---: | :--- | :--- |
| **A** | **Matrix Minimal (Activo)** | Squircle carbón mate con el chevron y prompt de terminal `>_` en gradiente esmeralda neón con resplandor sutil. | [`resources/icon-matrix-minimal.svg`](resources/icon-matrix-minimal.svg) |
| **B** | **Neo Grid** | Representación geométrica de la cuadrícula 2x2 de workspaces con nodos interactivos y pulsos de telemetría. | [`resources/icon-neo-grid.svg`](resources/icon-neo-grid.svg) |
| **C** | **Neo Monogram** | Letra **N** estilizada integrada con trazos de terminal chevron y pilares de consola en gradiente verde. | [`resources/icon-neo-monogram.svg`](resources/icon-neo-monogram.svg) |

---

## 🛠️ Desarrollo Local

Si deseas compilar o desarrollar localmente:

### Requisitos Previos
- [Node.js](https://nodejs.org/) (versión 20 o superior recomendada)
- `npm` o `pnpm`
- Herramientas de compilación C++ de tu SO para compilar `node-pty`:
  - **Linux (Ubuntu/Debian):** `sudo apt install build-essential python3`
  - **Windows:** `npm install --global --production windows-build-tools` o herramientas de C++ en Visual Studio Installer.

### Pasos

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/neukkken/neo-workspace.git
   cd neo-workspace
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Iniciar en modo desarrollo (HMR en vivo):**
   ```bash
   npm run dev
   ```

4. **Verificación de tipos TypeScript:**
   ```bash
   npm run typecheck
   ```

5. **Compilar aplicación:**
   ```bash
   npm run build
   ```

6. **Empaquetar ejecutables:**
   ```bash
   # Para tu sistema actual:
   npm run dist

   # Específico para Windows:
   npm run dist:win

   # Específico para Linux:
   npm run dist:linux
   ```

---

## 🏗️ Arquitectura del Proyecto

```
neowork/
├── .github/
│   └── workflows/
│       └── release.yml        # CI/CD automatizado en GitHub Actions (Win y Linux)
├── build/                     # Iconos y artefactos de empaquetado (.png, .ico)
├── resources/                 # Opciones de iconos vectoriales SVG
├── src/
│   ├── main/
│   │   ├── index.ts           # Proceso Principal de Electron y gestión de ventanas
│   │   ├── pty-manager.ts     # Orquestador de procesos PTY nativos (node-pty)
│   │   ├── store.ts           # Almacenamiento y persistencia JSON de workspaces
│   │   └── telemetry.ts       # Monitor de telemetría de CPU y memoria (pidusage)
│   ├── preload/
│   │   ├── index.ts           # ContextBridge seguro con APIs expuestas al renderer
│   │   └── index.d.ts         # Tipado estricto de window.neoAPI
│   └── renderer/
│       ├── index.html         # HTML base con fuentes JetBrains Mono e Inter
│       └── src/
│           ├── main.tsx       # Punto de entrada React
│           ├── App.tsx        # Contenedor principal y sincronización de estado
│           ├── types.ts       # Modelos de datos TypeScript
│           ├── components/    # Componentes modulares (TerminalGrid, Launchpad, etc.)
│           └── styles/
│               └── index.css  # Estilos base con Tailwind CSS
├── electron.vite.config.ts    # Configuración de empaquetado Electron + Vite
├── electron-builder.json      # Configuración de instaladores multiplataforma
├── LICENSE                    # Licencia MIT de Código Abierto
└── package.json
```

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas y muy apreciadas!

1. Haz un Fork del proyecto.
2. Crea una rama para tu feature o fix (`git checkout -b feature/nueva-mejora`).
3. Confirma tus cambios (`git commit -m 'feat: agrega nueva funcionalidad'`).
4. Haz push a tu rama (`git push origin feature/nueva-mejora`).
5. Abre un **Pull Request**.

---

## 📄 Licencia

Este proyecto está licenciado bajo los términos de la **Licencia MIT** - consulta el archivo [LICENSE](LICENSE) para más detalles.
