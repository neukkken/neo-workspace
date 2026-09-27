import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { networkInterfaces } from 'os'
import crypto from 'crypto'
import QRCode from 'qrcode'
import { PtyManager } from './pty-manager'
import { StoreManager } from './store'

export interface NetworkInterfaceInfo {
  name: string
  ip: string
  type: 'lan' | 'tailscale' | 'other'
}

export interface RemoteGatewayStatus {
  enabled: boolean
  port: number
  token: string
  interfaces: NetworkInterfaceInfo[]
  primaryUrl: string
  tailscaleUrl?: string
  qrCodeDataUrl: string
  clientCount: number
}

export class RemoteGateway {
  private server: http.Server | null = null
  private wss: WebSocketServer | null = null
  private port = 4050
  private token: string
  private clients = new Set<WebSocket>()
  private enabled = false
  private ptyUnsubscribe: (() => void) | null = null
  private activeWorkspaceId = ''
  private onStatusChangeCallbacks = new Set<(status: RemoteGatewayStatus) => void>()
  private onWorkspaceSelectCallback?: (workspaceId: string) => void

  constructor(
    private ptyManager: PtyManager,
    private store: StoreManager
  ) {
    this.token = crypto.randomBytes(8).toString('hex')
    this.activeWorkspaceId = this.store.getState().activeWorkspaceId || ''
  }

  public setActiveWorkspace(id: string): void {
    this.activeWorkspaceId = id
    this.broadcast({
      type: 'workspace:active-changed',
      activeWorkspaceId: id
    })
  }

  public onWorkspaceSelect(cb: (workspaceId: string) => void): void {
    this.onWorkspaceSelectCallback = cb
  }

  public onStatusChange(cb: (status: RemoteGatewayStatus) => void): () => void {
    this.onStatusChangeCallbacks.add(cb)
    return () => this.onStatusChangeCallbacks.delete(cb)
  }

  private notifyStatusChange(): void {
    this.getStatus().then((status) => {
      this.onStatusChangeCallbacks.forEach((cb) => {
        try {
          cb(status)
        } catch {}
      })
    })
  }

  public getNetworkInterfaces(): NetworkInterfaceInfo[] {
    const nets = networkInterfaces()
    const results: NetworkInterfaceInfo[] = []

    for (const name of Object.keys(nets)) {
      const netList = nets[name]
      if (!netList) continue
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          let type: 'lan' | 'tailscale' | 'other' = 'lan'
          if (name.toLowerCase().includes('tailscale') || net.address.startsWith('100.')) {
            type = 'tailscale'
          } else if (
            net.address.startsWith('192.168.') ||
            net.address.startsWith('10.') ||
            net.address.startsWith('172.')
          ) {
            type = 'lan'
          } else {
            type = 'other'
          }
          results.push({ name, ip: net.address, type })
        }
      }
    }
    return results
  }

  public async getStatus(): Promise<RemoteGatewayStatus> {
    const ifaces = this.getNetworkInterfaces()
    const lanIface = ifaces.find((i) => i.type === 'lan') || ifaces[0]
    const tailscaleIface = ifaces.find((i) => i.type === 'tailscale')

    const primaryIp = lanIface ? lanIface.ip : '127.0.0.1'
    const primaryUrl = `http://${primaryIp}:${this.port}?token=${this.token}`
    const tailscaleUrl = tailscaleIface
      ? `http://${tailscaleIface.ip}:${this.port}?token=${this.token}`
      : undefined

    let qrCodeDataUrl = ''
    try {
      qrCodeDataUrl = await QRCode.toDataURL(primaryUrl, {
        margin: 1,
        width: 320,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
    } catch (err) {
      console.error('Failed to generate QR code:', err)
    }

    return {
      enabled: this.enabled,
      port: this.port,
      token: this.token,
      interfaces: ifaces,
      primaryUrl,
      tailscaleUrl,
      qrCodeDataUrl,
      clientCount: this.clients.size
    }
  }

  public async regenerateToken(): Promise<RemoteGatewayStatus> {
    this.token = crypto.randomBytes(8).toString('hex')
    // Disconnect existing clients with old token
    for (const client of this.clients) {
      client.close(4001, 'Token Regenerated')
    }
    this.clients.clear()
    this.notifyStatusChange()
    return this.getStatus()
  }

  public async setPort(newPort: number): Promise<boolean> {
    if (newPort === this.port) return true
    this.port = newPort
    if (this.enabled) {
      await this.stop()
      return this.start()
    }
    this.notifyStatusChange()
    return true
  }

  public start(): Promise<boolean> {
    if (this.enabled && this.server) return Promise.resolve(true)

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res)
      })

      this.wss = new WebSocketServer({ noServer: true })

      this.server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`)
        if (url.pathname === '/ws') {
          const reqToken = url.searchParams.get('token')
          if (reqToken !== this.token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
          }
          this.wss?.handleUpgrade(request, socket, head, (ws) => {
            this.wss?.emit('connection', ws, request)
          })
        } else {
          socket.destroy()
        }
      })

      this.wss.on('connection', (ws) => {
        this.handleWebSocketConnection(ws)
      })

      // Global PTY output subscription
      this.ptyUnsubscribe = this.ptyManager.subscribeData((panelId, data) => {
        this.broadcast({
          type: 'terminal:data',
          panelId,
          data
        })
      })

      this.server.listen(this.port, '0.0.0.0', () => {
        this.enabled = true
        console.log(`[RemoteGateway] Server running at http://0.0.0.0:${this.port}`)
        this.notifyStatusChange()
        resolve(true)
      })

      this.server.on('error', (err) => {
        console.error('[RemoteGateway] Server error:', err)
        this.enabled = false
        this.notifyStatusChange()
        resolve(false)
      })
    })
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ptyUnsubscribe) {
        this.ptyUnsubscribe()
        this.ptyUnsubscribe = null
      }

      for (const client of this.clients) {
        client.close(1000, 'Server Stopped')
      }
      this.clients.clear()

      if (this.wss) {
        this.wss.close()
        this.wss = null
      }

      if (this.server) {
        this.server.close(() => {
          this.server = null
          this.enabled = false
          this.notifyStatusChange()
          resolve()
        })
      } else {
        this.enabled = false
        this.notifyStatusChange()
        resolve()
      }
    })
  }

  private broadcast(payload: any): void {
    if (this.clients.size === 0) return
    const msg = JSON.stringify(payload)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  }

  private handleWebSocketConnection(ws: WebSocket): void {
    this.clients.add(ws)
    this.notifyStatusChange()

    // Send initial snapshot
    const state = this.store.getState()
    const activeWs = state.workspaces.find((w) => w.id === this.activeWorkspaceId) || state.workspaces[0]
    const panels = activeWs ? activeWs.panels : []

    // Collect buffer snapshots for current panels
    const buffers: Record<string, string> = {}
    if (activeWs) {
      activeWs.panels.forEach((p) => {
        buffers[p.id] = this.ptyManager.getBuffer(p.id)
      })
      if (activeWs.canvasCards) {
        activeWs.canvasCards
          .filter((c) => c.kind === 'terminal')
          .forEach((c) => {
            buffers[c.id] = this.ptyManager.getBuffer(c.id)
          })
      }
    }

    ws.send(
      JSON.stringify({
        type: 'init',
        workspaces: state.workspaces,
        activeWorkspaceId: this.activeWorkspaceId || state.activeWorkspaceId,
        buffers
      })
    )

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        this.handleClientMessage(ws, msg)
      } catch (e) {
        console.error('[RemoteGateway] Bad message from client:', e)
      }
    })

    ws.on('close', () => {
      this.clients.delete(ws)
      this.notifyStatusChange()
    })

    ws.on('error', () => {
      this.clients.delete(ws)
      this.notifyStatusChange()
    })
  }

  private handleClientMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case 'pty:write': {
        if (msg.panelId && typeof msg.data === 'string') {
          this.ptyManager.write(msg.panelId, msg.data)
        }
        break
      }
      case 'agent:prompt': {
        if (msg.panelId && typeof msg.prompt === 'string') {
          const cmd = msg.prompt.endsWith('\n') ? msg.prompt : msg.prompt + '\n'
          this.ptyManager.write(msg.panelId, cmd)
        }
        break
      }
      case 'terminal:request-buffer': {
        if (msg.panelId) {
          const buffer = this.ptyManager.getBuffer(msg.panelId)
          ws.send(
            JSON.stringify({
              type: 'terminal:buffer',
              panelId: msg.panelId,
              buffer
            })
          )
        }
        break
      }
      case 'workspace:select': {
        if (msg.workspaceId) {
          this.setActiveWorkspace(msg.workspaceId)
          if (this.onWorkspaceSelectCallback) {
            this.onWorkspaceSelectCallback(msg.workspaceId)
          }
        }
        break
      }
    }
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (url.pathname === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          name: 'NeoWork Mobile Remote',
          short_name: 'NeoWork',
          start_url: `/?token=${this.token}`,
          display: 'standalone',
          background_color: '#090a0d',
          theme_color: '#090a0d',
          icons: [
            {
              src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23090a0d"/><circle cx="50" cy="50" r="30" fill="%2310b981"/></svg>',
              sizes: '192x192',
              type: 'image/svg+xml'
            }
          ]
        })
      )
      return
    }

    if (url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'ok',
          clients: this.clients.size,
          activeWorkspaceId: this.activeWorkspaceId
        })
      )
      return
    }

    // Main App HTML
    const token = url.searchParams.get('token')
    if (token !== this.token) {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>NeoWork - No Autorizado</title>
          <style>
            body { background: #090a0d; color: #f43f5e; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .box { padding: 2rem; border: 1px solid #27272a; border-radius: 8px; background: #12141a; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>⚠️ Acceso no autorizado</h2>
            <p style="color:#a1a1aa">El token de acceso es inválido o ha expirado.<br>Escanea nuevamente el código QR desde tu pantalla de NeoWork en el PC.</p>
          </div>
        </body>
        </html>
      `)
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(this.getMobileAppHtml())
  }

  private getMobileAppHtml(): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#090a0d">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>NeoWork Mobile</title>
  <link rel="manifest" href="/manifest.json">
  <style>
    :root {
      --bg: #090a0d;
      --card: #12141a;
      --card-border: #222631;
      --text: #e2e8f0;
      --text-muted: #71717a;
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.2);
      --cyan: #38bdf8;
      --rose: #f43f5e;
      --header-h: 56px;
      --input-h: 68px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    header {
      height: var(--header-h);
      padding: 0 16px;
      background: #0d0f14;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      shrink: 0;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.5px;
    }
    .brand-icon {
      width: 22px;
      height: 22px;
      border-radius: 5px;
      background: linear-gradient(135deg, #10b981, #06b6d4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #000;
      font-size: 11px;
      font-weight: 900;
      font-family: monospace;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-family: monospace;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.1);
      color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 6px var(--emerald);
    }
    .status-pill.disconnected {
      background: rgba(244, 63, 94, 0.1);
      color: var(--rose);
      border-color: rgba(244, 63, 94, 0.3);
    }
    .status-pill.disconnected .status-dot {
      background: var(--rose);
      box-shadow: none;
    }
    /* Workspaces Bar */
    .workspace-bar {
      padding: 8px 12px;
      background: #090b0e;
      border-bottom: 1px solid #1a1e27;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      shrink: 0;
    }
    .workspace-bar::-webkit-scrollbar { display: none; }
    .ws-pill {
      padding: 6px 14px;
      border-radius: 6px;
      background: #12151b;
      border: 1px solid #272c38;
      color: var(--text-muted);
      font-size: 12px;
      font-family: monospace;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .ws-pill.active {
      background: rgba(16, 185, 129, 0.15);
      border-color: var(--emerald);
      color: #fff;
      font-weight: 600;
    }
    /* Panels / Terminals Bar */
    .panels-bar {
      padding: 6px 12px;
      background: #0b0d12;
      border-bottom: 1px solid #1c212c;
      display: flex;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
      shrink: 0;
    }
    .panels-bar::-webkit-scrollbar { display: none; }
    .panel-tab {
      padding: 5px 12px;
      border-radius: 5px;
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      font-size: 11.5px;
      font-family: monospace;
      white-space: nowrap;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .panel-tab.active {
      background: #181d26;
      border-color: #313848;
      color: var(--cyan);
      font-weight: 600;
    }
    /* Terminal Console Viewport */
    .terminal-container {
      flex: 1;
      min-height: 0;
      position: relative;
      background: #050608;
      display: flex;
      flex-direction: column;
    }
    .terminal-output {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      font-family: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-all;
      user-select: text;
    }
    /* Quick Actions Overlay Bar */
    .quick-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      background: #0d0f14;
      border-top: 1px solid #1a1e27;
      font-family: monospace;
      font-size: 11px;
    }
    .quick-btn {
      padding: 4px 8px;
      border-radius: 4px;
      background: #181d26;
      border: 1px solid #282f3d;
      color: #cbd5e1;
      font-size: 11px;
      cursor: pointer;
    }
    .quick-btn:active { background: #222938; }
    .quick-btn.danger { color: #fb7185; }
    /* Bottom Prompt Input Bar */
    .prompt-bar {
      padding: 8px 12px max(8px, env(safe-area-inset-bottom));
      background: #0f1218;
      border-top: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      gap: 8px;
      shrink: 0;
    }
    .prompt-input {
      flex: 1;
      background: #161b24;
      border: 1px solid #2d3545;
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-family: monospace;
      font-size: 13px;
      outline: none;
      transition: border 0.15s ease;
    }
    .prompt-input:focus {
      border-color: var(--emerald);
      box-shadow: 0 0 10px var(--emerald-glow);
    }
    .send-btn {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      background: linear-gradient(135deg, #10b981, #059669);
      border: none;
      color: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-weight: 900;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
      transition: transform 0.1s;
    }
    .send-btn:active { transform: scale(0.95); }
    .empty-state {
      padding: 40px 20px;
      text-align: center;
      color: var(--text-muted);
      font-family: monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-icon">N</div>
      <span>NeoWork Mobile</span>
    </div>
    <div class="status-pill" id="statusPill">
      <div class="status-dot"></div>
      <span id="statusText">Conectado</span>
    </div>
  </header>

  <!-- Workspaces Tabs -->
  <div class="workspace-bar" id="workspaceBar"></div>

  <!-- Panels Tabs -->
  <div class="panels-bar" id="panelsBar"></div>

  <!-- Terminal Output -->
  <div class="terminal-container">
    <div class="terminal-output" id="terminalOutput"></div>
    <div class="quick-actions">
      <div style="display:flex; gap:6px;">
        <button class="quick-btn danger" onclick="sendData('\x03')">Ctrl+C</button>
        <button class="quick-btn" onclick="sendData('\r')">Enter ↵</button>
        <button class="quick-btn" onclick="sendData('\x1b[A')">↑</button>
        <button class="quick-btn" onclick="sendData('\x1b[B')">↓</button>
        <button class="quick-btn" onclick="sendData('\t')">Tab ⇥</button>
      </div>
      <div>
        <button class="quick-btn" onclick="clearTerminal()">Limpiar</button>
      </div>
    </div>
  </div>

  <!-- Prompt / Command Bar -->
  <form class="prompt-bar" id="promptForm" onsubmit="handleSendPrompt(event)">
    <input
      type="text"
      class="prompt-input"
      id="promptInput"
      placeholder="Prompt para el agente o comando..."
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
    />
    <button type="submit" class="send-btn" title="Enviar prompt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
  </form>

  <script>
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    let socket = null;
    let workspaces = [];
    let activeWorkspaceId = '';
    let activePanelId = '';
    let terminalBuffers = {};
    let autoScroll = true;

    const termOutput = document.getElementById('terminalOutput');
    const promptInput = document.getElementById('promptInput');
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const wsBar = document.getElementById('workspaceBar');
    const panelsBar = document.getElementById('panelsBar');

    function connectWs() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = \`\${proto}//\${window.location.host}/ws?token=\${token}\`;

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        statusPill.className = 'status-pill';
        statusText.textContent = 'En vivo';
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      };

      socket.onclose = () => {
        statusPill.className = 'status-pill disconnected';
        statusText.textContent = 'Reconectando...';
        setTimeout(connectWs, 2000);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    function handleMessage(msg) {
      switch (msg.type) {
        case 'init': {
          workspaces = msg.workspaces || [];
          activeWorkspaceId = msg.activeWorkspaceId || (workspaces[0] ? workspaces[0].id : '');
          terminalBuffers = msg.buffers || {};
          renderWorkspaces();
          renderPanels();
          renderActiveTerminal();
          break;
        }
        case 'workspace:active-changed': {
          if (msg.activeWorkspaceId) {
            activeWorkspaceId = msg.activeWorkspaceId;
            renderWorkspaces();
            renderPanels();
            renderActiveTerminal();
          }
          break;
        }
        case 'terminal:data': {
          const { panelId, data } = msg;
          if (!terminalBuffers[panelId]) terminalBuffers[panelId] = '';
          terminalBuffers[panelId] += data;
          if (terminalBuffers[panelId].length > 150000) {
            terminalBuffers[panelId] = terminalBuffers[panelId].slice(-100000);
          }
          if (panelId === activePanelId) {
            appendTerminalOutput(data);
          }
          break;
        }
        case 'terminal:buffer': {
          const { panelId, buffer } = msg;
          terminalBuffers[panelId] = buffer || '';
          if (panelId === activePanelId) {
            renderActiveTerminal();
          }
          break;
        }
      }
    }

    function renderWorkspaces() {
      wsBar.innerHTML = '';
      workspaces.forEach((w) => {
        const btn = document.createElement('button');
        btn.className = \`ws-pill \${w.id === activeWorkspaceId ? 'active' : ''}\`;
        btn.textContent = w.name;
        btn.onclick = () => {
          activeWorkspaceId = w.id;
          renderWorkspaces();
          renderPanels();
          renderActiveTerminal();
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'workspace:select', workspaceId: w.id }));
          }
        };
        wsBar.appendChild(btn);
      });
    }

    function getActivePanels() {
      const ws = workspaces.find((w) => w.id === activeWorkspaceId);
      if (!ws) return [];
      const list = [...(ws.panels || [])];
      if (ws.canvasCards) {
        ws.canvasCards.filter((c) => c.kind === 'terminal').forEach((c) => {
          if (!list.some((p) => p.id === c.id)) {
            list.push({ id: c.id, title: c.title || 'Canvas Console' });
          }
        });
      }
      return list;
    }

    function renderPanels() {
      panelsBar.innerHTML = '';
      const panels = getActivePanels();
      if (panels.length === 0) {
        panelsBar.innerHTML = '<span style="color:#71717a;font-size:11px;padding:4px;">Sin consolas activas</span>';
        activePanelId = '';
        return;
      }
      if (!panels.some((p) => p.id === activePanelId)) {
        activePanelId = panels[0].id;
      }

      panels.forEach((p) => {
        const btn = document.createElement('button');
        btn.className = \`panel-tab \${p.id === activePanelId ? 'active' : ''}\`;
        btn.innerHTML = \`<span style="color:#10b981">▶</span> <span>\${p.title || 'Terminal'}</span>\`;
        btn.onclick = () => {
          activePanelId = p.id;
          renderPanels();
          renderActiveTerminal();
          if (socket && socket.readyState === WebSocket.OPEN && !terminalBuffers[p.id]) {
            socket.send(JSON.stringify({ type: 'terminal:request-buffer', panelId: p.id }));
          }
        };
        panelsBar.appendChild(btn);
      });
    }

    function ansiToHtml(text) {
      let clean = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const colors = {
        '30': '#181a1f', '31': '#f43f5e', '32': '#10b981', '33': '#f59e0b',
        '34': '#38bdf8', '35': '#c084fc', '36': '#2dd4bf', '37': '#f1f5f9',
        '90': '#71717a', '91': '#fb7185', '92': '#34d399', '93': '#fbbf24',
        '94': '#60a5fa', '95': '#d8b4fe', '96': '#5eead4', '97': '#ffffff'
      };
      clean = clean.replace(/\\x1b\\[(\\d+(?:;\\d+)*)m/g, (match, codes) => {
        const parts = codes.split(';');
        for (const code of parts) {
          if (code === '0') return '</span>';
          if (colors[code]) return \`<span style="color:\${colors[code]}">\`;
          if (code === '1') return '<span style="font-weight:bold">';
        }
        return '';
      });
      return clean;
    }

    function renderActiveTerminal() {
      if (!activePanelId) {
        termOutput.innerHTML = '<div class="empty-state">Selecciona una consola para interactuar.</div>';
        return;
      }
      const raw = terminalBuffers[activePanelId] || '';
      if (!raw) {
        termOutput.innerHTML = '<div class="empty-state">Consola iniciada. Esperando comandos o salida del agente...</div>';
      } else {
        termOutput.innerHTML = ansiToHtml(raw);
      }
      scrollToBottom();
    }

    function appendTerminalOutput(chunk) {
      if (termOutput.children.length === 1 && termOutput.children[0].classList.contains('empty-state')) {
        termOutput.innerHTML = '';
      }
      const span = document.createElement('span');
      span.innerHTML = ansiToHtml(chunk);
      termOutput.appendChild(span);
      if (autoScroll) {
        scrollToBottom();
      }
    }

    function scrollToBottom() {
      termOutput.scrollTop = termOutput.scrollHeight;
    }

    termOutput.addEventListener('scroll', () => {
      const atBottom = termOutput.scrollHeight - termOutput.scrollTop - termOutput.clientHeight < 40;
      autoScroll = atBottom;
    });

    function clearTerminal() {
      if (activePanelId) {
        terminalBuffers[activePanelId] = '';
        renderActiveTerminal();
      }
    }

    function sendData(data) {
      if (!activePanelId || !socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: 'pty:write',
        panelId: activePanelId,
        data: data
      }));
    }

    function handleSendPrompt(e) {
      e.preventDefault();
      const val = promptInput.value.trim();
      if (!val || !activePanelId || !socket || socket.readyState !== WebSocket.OPEN) return;

      socket.send(JSON.stringify({
        type: 'agent:prompt',
        panelId: activePanelId,
        prompt: val
      }));

      if ('vibrate' in navigator) {
        navigator.vibrate(20);
      }

      promptInput.value = '';
      promptInput.focus();
    }

    connectWs();
  </script>
</body>
</html>`
  }
}
