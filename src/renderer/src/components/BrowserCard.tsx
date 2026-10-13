import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Globe,
  RotateCw,
  ExternalLink,
  Trash2,
  Maximize2,
  Minimize2,
  Smartphone,
  Tablet,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Home,
  Code,
  Search,
  Plus,
  X
} from 'lucide-react'
import { CanvasCard } from '../types'

interface BrowserCardProps {
  card: CanvasCard
  isFocused: boolean
  onFocus: () => void
  onUpdate: (updates: Partial<CanvasCard>) => void
  onDelete: (id: string) => void
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResizeStart: (e: React.MouseEvent, id: string) => void
}

type ViewportMode = 'full' | 'tablet' | 'mobile'

export interface BrowserTab {
  id: string
  url: string
  title: string
  isLoading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
}

const CHROME_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'

export const BrowserCard: React.FC<BrowserCardProps> = ({
  card,
  isFocused,
  onFocus,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart
}) => {
  const initialUrl = card.url || 'https://www.google.com'
  const initialTabIdRef = useRef(`tab-${Date.now()}`)

  // Multi-Window / Multi-Tab Integrated State
  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: initialTabIdRef.current,
      url: initialUrl,
      title: card.title || 'Google',
      isLoading: false,
      canGoBack: false,
      canGoForward: false
    }
  ])
  const [activeTabId, setActiveTabId] = useState<string>(initialTabIdRef.current)

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || {
    id: initialTabIdRef.current,
    url: initialUrl,
    title: 'Google'
  }

  const [inputUrl, setInputUrl] = useState(activeTab.url)
  const [isExpanded, setIsExpanded] = useState(false)
  const [viewport, setViewport] = useState<ViewportMode>('full')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const webviewRef = useRef<any>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [useIframeFallback, setUseIframeFallback] = useState(false)

  // Smart URL formatter: handles search queries, local ports, and direct URLs
  const formatUrl = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed) return 'https://www.google.com'

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }

    if (
      trimmed.startsWith('localhost:') ||
      trimmed.startsWith('127.0.0.1:') ||
      trimmed.startsWith(':')
    ) {
      const portPart = trimmed.startsWith(':') ? `localhost${trimmed}` : trimmed
      return `http://${portPart}`
    }

    // Check if it's a domain name (e.g. google.com, github.com, vite.dev)
    if (!trimmed.includes(' ') && trimmed.includes('.') && !trimmed.endsWith('.')) {
      return `https://${trimmed}`
    }

    // Search query fallback using Google
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
  }

  // Navigate active tab to target URL
  const navigateTo = useCallback(
    (target: string) => {
      const formatted = formatUrl(target)
      setInputUrl(formatted)

      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, url: formatted } : t))
      )
      onUpdate({ url: formatted })

      const webview = webviewRef.current
      if (webview) {
        try {
          if (typeof webview.loadURL === 'function') {
            webview.loadURL(formatted)
          } else {
            webview.src = formatted
          }
        } catch {
          setUseIframeFallback(true)
        }
      }
    },
    [activeTabId, onUpdate]
  )

  const handleNavigate = (e?: React.FormEvent): void => {
    if (e) e.preventDefault()
    navigateTo(inputUrl)
  }

  const handleQuickBookmark = (url: string): void => {
    navigateTo(url)
  }

  // Create new Tab / Window
  const handleNewTab = (targetUrl = 'https://www.google.com'): void => {
    const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const formatted = formatUrl(targetUrl)
    const newTab: BrowserTab = {
      id: newId,
      url: formatted,
      title: 'Nueva pestaña',
      isLoading: false,
      canGoBack: false,
      canGoForward: false
    }

    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newId)
    setInputUrl(formatted)
    onUpdate({ url: formatted })
  }

  // Close Tab / Window
  const handleCloseTab = (tabId: string): void => {
    if (tabs.length <= 1) {
      // If closing the last tab, reset to default home
      const defaultUrl = 'https://www.google.com'
      const freshTab: BrowserTab = {
        id: `tab-${Date.now()}`,
        url: defaultUrl,
        title: 'Google',
        isLoading: false,
        canGoBack: false,
        canGoForward: false
      }
      setTabs([freshTab])
      setActiveTabId(freshTab.id)
      setInputUrl(defaultUrl)
      onUpdate({ url: defaultUrl })
      return
    }

    const remaining = tabs.filter((t) => t.id !== tabId)
    setTabs(remaining)

    if (activeTabId === tabId) {
      const closedIndex = tabs.findIndex((t) => t.id === tabId)
      const nextIndex = Math.max(0, closedIndex - 1)
      const nextTab = remaining[nextIndex] || remaining[0]
      setActiveTabId(nextTab.id)
      setInputUrl(nextTab.url)
      onUpdate({ url: nextTab.url })
    }
  }

  // Switch Active Tab
  const handleSelectTab = (tabId: string): void => {
    const target = tabs.find((t) => t.id === tabId)
    if (!target) return
    setActiveTabId(tabId)
    setInputUrl(target.url)
    onUpdate({ url: target.url })
  }

  const handleReload = (): void => {
    const webview = webviewRef.current
    if (webview && typeof webview.reload === 'function') {
      webview.reload()
    } else if (iframeRef.current) {
      iframeRef.current.src = activeTab.url
    }
  }

  const handleGoBack = (): void => {
    const webview = webviewRef.current
    if (webview && typeof webview.goBack === 'function' && webview.canGoBack?.()) {
      webview.goBack()
    }
  }

  const handleGoForward = (): void => {
    const webview = webviewRef.current
    if (webview && typeof webview.goForward === 'function' && webview.canGoForward?.()) {
      webview.goForward()
    }
  }

  const handleOpenDevTools = (): void => {
    const webview = webviewRef.current
    if (webview && typeof webview.openDevTools === 'function') {
      webview.openDevTools()
    }
  }

  const handleOpenExternal = (): void => {
    if (activeTab.url) {
      window.open(activeTab.url, '_blank')
    }
  }

  // Listen to webview events for title, navigation, back/forward history and loading
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const updateNavState = (): void => {
      try {
        const back = webview.canGoBack?.() ?? false
        const fwd = webview.canGoForward?.() ?? false
        setCanGoBack(back)
        setCanGoForward(fwd)
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId ? { ...t, canGoBack: back, canGoForward: fwd } : t
          )
        )
      } catch {}
    }

    const handleDidNavigate = (e: any): void => {
      if (e.url) {
        setInputUrl(e.url)
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, url: e.url } : t))
        )
        onUpdate({ url: e.url })
      }
      updateNavState()
    }

    const handlePageTitleUpdated = (e: any): void => {
      if (e.title) {
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, title: e.title } : t))
        )
      }
    }

    const handleStartLoading = (): void => {
      setIsLoading(true)
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: true } : t))
      )
    }

    const handleStopLoading = (): void => {
      setIsLoading(false)
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t))
      )
      updateNavState()
    }

    const handleFailLoad = (_e: any): void => {
      setIsLoading(false)
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isLoading: false } : t))
      )
    }

    // Integrated window/popup interceptor: target="_blank" opens a new tab in this card!
    const handleNewWindow = (e: any): void => {
      e.preventDefault()
      if (e.url) {
        handleNewTab(e.url)
      }
    }

    webview.addEventListener('did-navigate', handleDidNavigate)
    webview.addEventListener('did-navigate-in-page', handleDidNavigate)
    webview.addEventListener('page-title-updated', handlePageTitleUpdated)
    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-fail-load', handleFailLoad)
    webview.addEventListener('new-window', handleNewWindow)

    return () => {
      webview.removeEventListener('did-navigate', handleDidNavigate)
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate)
      webview.removeEventListener('page-title-updated', handlePageTitleUpdated)
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-fail-load', handleFailLoad)
      webview.removeEventListener('new-window', handleNewWindow)
    }
  }, [activeTabId, onUpdate])

  const cardStyle: React.CSSProperties = isExpanded
    ? {
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        bottom: 10,
        width: 'calc(100% - 20px)',
        height: 'calc(100% - 20px)',
        zIndex: 999
      }
    : {
        position: 'absolute',
        left: `${card.x}px`,
        top: `${card.y}px`,
        width: `${card.width}px`,
        height: `${card.height}px`,
        zIndex: isFocused ? 50 : card.zIndex || 10
      }

  const getViewportWidth = (): string => {
    switch (viewport) {
      case 'mobile':
        return '375px'
      case 'tablet':
        return '768px'
      default:
        return '100%'
    }
  }

  return (
    <div
      style={{ ...cardStyle, overscrollBehavior: 'contain' }}
      onClick={onFocus}
      onWheel={(e) => {
        e.stopPropagation()
        if (!isFocused) {
          e.preventDefault()
        }
      }}
      className={`canvas-card pointer-events-auto flex flex-col bg-[#0d0f14] rounded-lg border shadow-xl overflow-hidden select-none transition-shadow ${
        isFocused
          ? 'border-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/40'
          : 'border-zinc-800/90 hover:border-zinc-700/80'
      }`}
    >
      {/* Header Bar */}
      <div
        onMouseDown={(e) => onDragStart(e, card.id)}
        className="h-9 px-2.5 bg-[#12151b] border-b border-zinc-800 flex items-center justify-between cursor-move select-none shrink-0"
      >
        {/* Left: Indicator & Title */}
        <div className="flex items-center space-x-2 truncate">
          <Globe size={13} className="text-cyan-400 shrink-0" />
          <span className="font-mono text-[11px] font-semibold tracking-wide text-zinc-200 uppercase truncate">
            {activeTab.title || 'WEB-BROWSER'}
          </span>
          <span className="hidden sm:inline-block text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 rounded">
            {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
          </span>
        </div>

        {/* Right: Actions */}
        <div
          className="flex items-center space-x-1"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Responsive viewport controls */}
          <div className="flex items-center space-x-0.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded mr-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setViewport('full')
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`p-1 rounded transition-colors cursor-pointer ${
                viewport === 'full' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Resolución Completa (100%)"
            >
              <Monitor size={11} className="pointer-events-none" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setViewport('tablet')
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`p-1 rounded transition-colors cursor-pointer ${
                viewport === 'tablet' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Vista Tablet (768px)"
            >
              <Tablet size={11} className="pointer-events-none" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setViewport('mobile')
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`p-1 rounded transition-colors cursor-pointer ${
                viewport === 'mobile' ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Vista Móvil (375px)"
            >
              <Smartphone size={11} className="pointer-events-none" />
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenDevTools()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Abrir DevTools del Navegador"
          >
            <Code size={11} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleOpenExternal()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Abrir en navegador externo del sistema"
          >
            <ExternalLink size={12} className="pointer-events-none" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded((prev) => !prev)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title={isExpanded ? 'Restaurar tamaño' : 'Maximizar tarjeta'}
          >
            {isExpanded ? (
              <Minimize2 size={12} className="pointer-events-none" />
            ) : (
              <Maximize2 size={12} className="pointer-events-none" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(card.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
            title="Eliminar nodo de navegador"
          >
            <Trash2 size={13} className="pointer-events-none" />
          </button>
        </div>
      </div>

      {/* Integrated Window / Tabs Bar */}
      <div
        className="h-7 px-1.5 bg-[#0a0c10] border-b border-zinc-800/80 flex items-center space-x-1 shrink-0 overflow-x-auto no-scrollbar"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => handleSelectTab(tab.id)}
              className={`group flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer max-w-[170px] truncate select-none ${
                isActive
                  ? 'bg-zinc-800 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800/60'
              }`}
              title={tab.url}
            >
              <Globe size={10} className={isActive ? 'text-cyan-400 shrink-0' : 'text-zinc-500 shrink-0'} />
              <span className="truncate">{tab.title || 'Pestaña'}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloseTab(tab.id)
                }}
                className="opacity-40 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded text-zinc-400 transition-opacity"
                title="Cerrar pestaña"
              >
                <X size={10} />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => handleNewTab('https://www.google.com')}
          className="p-1 rounded text-zinc-500 hover:text-cyan-400 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          title="Abrir nueva ventana / pestaña"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Navigation Toolbar */}
      <div
        className="h-8 px-2 bg-[#090b0e] border-b border-zinc-800/80 flex items-center space-x-1 shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* History Nav */}
        <button
          type="button"
          onClick={handleGoBack}
          disabled={!canGoBack}
          className={`p-1 rounded transition-colors cursor-pointer ${
            canGoBack ? 'text-zinc-300 hover:bg-zinc-800' : 'text-zinc-600 cursor-not-allowed'
          }`}
          title="Atrás"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          type="button"
          onClick={handleGoForward}
          disabled={!canGoForward}
          className={`p-1 rounded transition-colors cursor-pointer ${
            canGoForward ? 'text-zinc-300 hover:bg-zinc-800' : 'text-zinc-600 cursor-not-allowed'
          }`}
          title="Adelante"
        >
          <ChevronRight size={13} />
        </button>
        <button
          type="button"
          onClick={handleReload}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Recargar página"
        >
          <RotateCw size={12} className={isLoading ? 'animate-spin text-cyan-400' : ''} />
        </button>
        <button
          type="button"
          onClick={() => navigateTo('https://www.google.com')}
          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Ir a inicio (Google)"
        >
          <Home size={12} />
        </button>

        {/* Smart Omnibar Input */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center relative min-w-0">
          <Search size={11} className="absolute left-2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Introduce URL o busca en Google..."
            className="w-full bg-[#12151c] text-zinc-200 text-xs font-mono pl-7 pr-2 py-1 rounded border border-zinc-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/40 focus:outline-none transition-all truncate"
          />
        </form>

        {/* Quick Port Bookmarks */}
        <div className="hidden lg:flex items-center space-x-1 pl-1">
          {[5173, 3000, 8080].map((port) => (
            <button
              key={port}
              type="button"
              onClick={() => handleQuickBookmark(`http://localhost:${port}`)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-300 border border-zinc-800 transition-colors cursor-pointer"
            >
              :{port}
            </button>
          ))}
        </div>
      </div>

      {/* Web Content Container */}
      <div
        style={{ overscrollBehavior: 'contain' }}
        className="flex-1 w-full h-full relative min-h-0 bg-[#060709] overflow-hidden flex justify-center"
      >
        <div
          style={{
            width: getViewportWidth(),
            height: '100%',
            pointerEvents: isFocused ? 'auto' : 'none'
          }}
          className={`h-full transition-all duration-200 relative ${
            viewport !== 'full' ? 'border-x border-zinc-800/60 shadow-2xl' : ''
          }`}
        >
          {useIframeFallback ? (
            <iframe
              ref={iframeRef}
              src={activeTab.url}
              title={activeTab.title}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              className="w-full h-full border-0 select-auto"
            />
          ) : (
            <webview
              ref={webviewRef}
              key={activeTab.id}
              src={activeTab.url}
              allowpopups={true}
              partition="persist:neowork-browser"
              useragent={CHROME_USER_AGENT}
              className="w-full h-full border-0 select-auto"
              style={{ width: '100%', height: '100%' }}
            />
          )}

          {/* Loading bar */}
          {isLoading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-500/30 overflow-hidden z-20">
              <div className="h-full bg-cyan-400 animate-pulse w-full" />
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle (Bottom Right) */}
      {!isExpanded && (
        <div
          onMouseDown={(e) => onResizeStart(e, card.id)}
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-zinc-600 hover:text-cyan-400"
          title="Redimensionar nodo"
        >
          <svg viewBox="0 0 6 6" width="6" height="6" fill="currentColor">
            <polygon points="6 0, 6 6, 0 6" />
          </svg>
        </div>
      )}
    </div>
  )
}
