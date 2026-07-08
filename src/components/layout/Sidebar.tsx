import { Film, Type, Music, Clapperboard, Zap } from 'lucide-react'

type Page = 'dashboard' | 'editor' | 'texts' | 'songs' | 'drops'

interface SidebarProps {
  current: Page
  onChange: (page: Page) => void
}

const nav: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <Clapperboard size={18} /> },
  { id: 'editor',    label: 'Editar vídeo', icon: <Film size={18} /> },
  { id: 'texts',     label: 'Textos', icon: <Type size={18} /> },
  { id: 'songs',     label: 'Canciones', icon: <Music size={18} /> },
  { id: 'drops',     label: 'Drop Editor', icon: <Zap size={18} /> },
]

export function Sidebar({ current, onChange }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
            <Clapperboard size={14} className="text-white" />
          </span>
          <span className="font-semibold text-zinc-100 text-sm">SRZ Editor</span>
        </div>
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-0.5">
        {nav.map(item => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`
              w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left
              transition-colors cursor-pointer
              ${
                current === item.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }
            `}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
