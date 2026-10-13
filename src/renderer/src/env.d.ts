/// <reference types="vite/client" />
import React from 'react'
import type { NeoAPI } from '../../preload'

declare global {
  interface Window {
    neoAPI: NeoAPI
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        allowpopups?: string | boolean
        partition?: string
        httpreferrer?: string
        useragent?: string
        webpreferences?: string
      }
    }
  }
}
