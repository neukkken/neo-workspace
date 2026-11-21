import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Renderer-only build used by Tauri (electron-vite keeps serving the Electron build).
export default defineConfig({
  root: resolve('src/renderer'),
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: resolve('out-tauri'), emptyOutDir: true }
})
