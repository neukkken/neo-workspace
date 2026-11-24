/// <reference types="vite/client" />
import type { NeoAPI } from './neo-api'

declare global {
  interface Window {
    neoAPI: NeoAPI
  }
}
