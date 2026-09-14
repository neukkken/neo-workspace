# NeoWork - Developer Workspace Orchestrator

**NeoWork** es una aplicación de escritorio moderna diseñada para desarrolladores que necesitan orquestar múltiples terminales, procesos y entornos de trabajo (*Workspaces*) organizados por proyecto.

Inspirada en el flujo de trabajo de paneles de control modernos (estilo **Render.com / Linear / Vercel**), NeoWork permite definir rutas (`cwd`), comandos de inicio automático (como `npm run dev`, `docker compose up`, `python agent.py`, `git status`) y monitorizar en tiempo real el consumo de CPU y memoria de cada terminal.

---

## ✨ Características Principales

1. **Gestión de Múltiples Workspaces (Launchpad lateral):**
   - Crea, edita y elimina entornos de trabajo independientes.
   - Cada workspace contiene su propia cuadrícula de terminales configuradas con sus comandos y carpetas.
   - Persistencia automática de la configuración en disco en formato JSON.

2. **Terminales Reales e Interactivas (Pseudo-terminales PTY):**
   - Motor nativo basado en `node-pty` y `xterm.js` con soporte para colores ANSI 24-bit TrueColor.
   - Totalmente interactivo: soporta `Ctrl+C`, preguntas interactivas `y/n`, comandos interactivos de Git, Vite, Docker, etc.
   - Soporta auto-ajuste de columnas y filas (`FitAddon`) al redimensionar la ventana.

3. **Selector Visual de Carpetas:**
   - Puedes escribir la ruta manualmente o hacer clic en **"Browse"** para abrir el explorador de archivos nativo y seleccionar la carpeta de tu proyecto sin riesgo de errores tipográficos.

4. **Auto-ejecución de Procesos:**
   - Configura comandos iniciales por panel que se lanzan automáticamente en su ruta destino al abrir el workspace.
   - Opción para activar o desactivar la ejecución automática panel por panel.

5. **Telemetría en Tiempo Real:**
   - Indicador de consumo de **CPU %** y **RAM (MB)** por cada panel y terminal individual.
   - Métricas agregadas a nivel de workspace y del sistema en la barra superior.

6. **Controles Rápidos por Panel:**
   - **Restart:** Reinicia el proceso y vuelve a ejecutar el comando configurado.
   - **Clear:** Limpia el buffer de la terminal.
   - **Maximize / Restore:** Amplía un panel al 100% de la pantalla para inspeccionar logs largos de Docker o compilaciones y regresa a la cuadrícula con un clic.
   - **Copy Path:** Copia rápidamente la ruta de trabajo al portapapeles.

7. **Diseño Moderno "Render / Developer Dashboard":**
   - Paleta de color oscura profesional en tonos grafito y zinc (`#090a0d`).
   - Acentos en verde esmeralda (`#10b981`), badges sutiles y tipografía clara (`Inter` para la interfaz y `JetBrains Mono` para terminales y rutas).

---

## 🚀 Cómo Iniciar el Proyecto

### Modo Desarrollo
Para ejecutar la aplicación con recarga rápida en vivo (Hot Module Reloading):
```bash
npm run dev
```

### Compilar y Ejecutar en Producción
```bash
npm run build
npm start
```

### Verificación de Tipos TypeScript
```bash
npm run typecheck
```

---

## 🛠️ Estructura del Proyecto

```
neowork/
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
│           ├── components/
│           │   ├── TitleBar.tsx        # Barra superior con telemetría y controles
│           │   ├── Launchpad.tsx       # Barra lateral de selección de workspaces
│           │   ├── WorkspaceHeader.tsx # Encabezado con métricas y controles
│           │   ├── TerminalGrid.tsx    # Cuadrícula 2x2 y modo maximizado
│           │   ├── TerminalPanel.tsx   # Panel de terminal con acciones rápidas
│           │   ├── XTermView.tsx       # Instancia encapsulada de xterm.js
│           │   ├── WorkspaceModal.tsx  # Modal de creación y edición de rutas/comandos
│           │   ├── StatusBar.tsx       # Pie de página con indicador y guardado
│           │   └── SettingsModal.tsx   # Modal de configuración y reset
│           └── styles/
│               └── index.css           # Estilos base con Tailwind v4
├── electron.vite.config.ts    # Configuración de empaquetado Electron + Vite
└── package.json
```
