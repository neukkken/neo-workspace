export interface SpawnOptions {
    panelId: string;
    cwd: string;
    command?: string;
    cols?: number;
    rows?: number;
}
export interface PanelConfig {
    id: string;
    title: string;
    cwd: string;
    command: string;
    autoStart: boolean;
}
export type TerminalThemeName = 'matrix' | 'dracula' | 'tokyo' | 'monokai' | 'nord';
export type WorkspaceLayoutMode = 'grid' | 'canvas';
export interface Workspace {
    id: string;
    name: string;
    code: string;
    panels: PanelConfig[];
    layoutMode?: WorkspaceLayoutMode;
    canvasCards?: any[];
}
export type SidebarPosition = 'left' | 'right' | 'top' | 'bottom';
export interface AppSettings {
    sidebarPosition: SidebarPosition;
    terminalTheme?: TerminalThemeName;
    terminalFontSize?: number;
    defaultShell?: string;
}
export interface AppState {
    activeWorkspaceId: string;
    workspaces: Workspace[];
    settings?: AppSettings;
}
export interface ProcessMetrics {
    cpu: number;
    memoryMb: number;
}
export interface SystemMetrics {
    cpuPercent: number;
    usedMemMb: number;
    totalMemMb: number;
}
export interface TelemetryPayload {
    system: SystemMetrics;
    panels: Record<string, ProcessMetrics>;
}
export type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
export interface UpdateInfo {
    version: string;
    releaseDate?: string;
    releaseNotes?: string;
}
export interface UpdateProgress {
    percent: number;
    transferredMb: number;
    totalMb: number;
    bytesPerSecond: number;
}
export interface UpdateStatusPayload {
    state: UpdateState;
    info?: UpdateInfo;
    progress?: UpdateProgress;
    error?: string;
}
export type NeoAPI = typeof neoAPI;
export declare const neoAPI: {
    getStore: () => Promise<AppState>;
    saveStore: (state: AppState) => Promise<boolean>;
    selectDirectory: (defaultPath?: string) => Promise<string | null>;
    writeClipboard: (text: string) => Promise<boolean>;
    readClipboard: () => Promise<string>;
    spawnTerminal: (options: SpawnOptions) => Promise<boolean>;
    writeTerminal: (panelId: string, data: string) => void;
    resizeTerminal: (panelId: string, cols: number, rows: number) => void;
    killTerminal: (panelId: string) => Promise<boolean>;
    killAllTerminals: () => Promise<boolean>;
    onTerminalData: (panelId: string, callback: (data: string) => void) => (() => void);
    onTerminalExit: (panelId: string, callback: (exitInfo: {
        code: number;
        signal?: number;
    }) => void) => (() => void);
    onTelemetry: (callback: (data: TelemetryPayload) => void) => (() => void);
    checkForUpdates: () => Promise<UpdateStatusPayload>;
    downloadUpdate: () => Promise<boolean>;
    quitAndInstallUpdate: () => void;
    onUpdaterStatus: (callback: (status: UpdateStatusPayload) => void) => (() => void);
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;
    isWindowMaximized: () => Promise<boolean>;
    getAppVersion: () => Promise<string>;
};
