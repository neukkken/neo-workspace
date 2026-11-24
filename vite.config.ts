import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Renderer build: Tauri serves out-tauri/ (and this dev server) inside its webview.
export default defineConfig({
  root: resolve('src/renderer'),
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: resolve('out-tauri'), emptyOutDir: true }
})
