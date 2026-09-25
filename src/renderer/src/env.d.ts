/// <reference types="vite/client" />
import type { NeoAPI } from '../../preload'

declare global {
  interface Window {
    neoAPI: NeoAPI
  }
}
