import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[RootErrorBoundary] Uncaught React Error:', error, errorInfo)
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          width: '100vw',
          backgroundColor: '#090a0d',
          color: '#f43f5e',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: '680px',
            width: '100%',
            background: '#12141a',
            border: '1px solid #27272a',
            borderRadius: '8px',
            padding: '24px'
          }}>
            <h2 style={{ fontSize: '18px', marginBottom: '12px', color: '#f43f5e' }}>
              ⚠️ Error de Renderizado en NeoWork
            </h2>
            <p style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '16px' }}>
              Se produjo un error inesperado al cargar la interfaz de usuario:
            </p>
            <pre style={{
              background: '#090a0d',
              padding: '12px',
              borderRadius: '6px',
              overflowX: 'auto',
              fontSize: '12px',
              color: '#fb7185',
              whiteSpace: 'pre-wrap',
              marginBottom: '20px'
            }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: '#10b981',
                color: '#000',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'monospace'
              }}
            >
              Reiniciar Interfaz
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
)
