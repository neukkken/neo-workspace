import {
  FolderKanban,
  Code,
  Terminal,
  Globe,
  Database,
  Server,
  Cloud,
  Rocket,
  Bot,
  Smartphone,
  Package,
  Gamepad2,
  Palette,
  FlaskConical,
  BookOpen,
  Briefcase,
  ShoppingCart,
  Wrench,
  Music,
  Zap,
  type LucideIcon
} from 'lucide-react'

// Keys are what gets saved in Workspace.icon, so renaming one orphans saved workspaces
export const WORKSPACE_ICONS: Record<string, { Icon: LucideIcon; label: string }> = {
  folder: { Icon: FolderKanban, label: 'Carpeta' },
  code: { Icon: Code, label: 'Código' },
  terminal: { Icon: Terminal, label: 'Terminal' },
  globe: { Icon: Globe, label: 'Web' },
  database: { Icon: Database, label: 'Base de datos' },
  server: { Icon: Server, label: 'Servidor' },
  cloud: { Icon: Cloud, label: 'Nube' },
  rocket: { Icon: Rocket, label: 'Cohete' },
  bot: { Icon: Bot, label: 'Bot' },
  smartphone: { Icon: Smartphone, label: 'Móvil' },
  package: { Icon: Package, label: 'Paquete' },
  gamepad: { Icon: Gamepad2, label: 'Juego' },
  palette: { Icon: Palette, label: 'Diseño' },
  flask: { Icon: FlaskConical, label: 'Laboratorio' },
  book: { Icon: BookOpen, label: 'Documentación' },
  briefcase: { Icon: Briefcase, label: 'Trabajo' },
  cart: { Icon: ShoppingCart, label: 'Tienda' },
  wrench: { Icon: Wrench, label: 'Herramientas' },
  music: { Icon: Music, label: 'Música' },
  zap: { Icon: Zap, label: 'Rayo' }
}

export const workspaceIcon = (key?: string): LucideIcon => WORKSPACE_ICONS[key ?? '']?.Icon ?? FolderKanban
