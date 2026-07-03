import { useEffect, useState } from 'react'
import { LayoutTemplate, Film, Plus, Clapperboard } from 'lucide-react'
import { getTemplates, getProjects } from '../lib/db'
import type { Template, VideoProject } from '../types'
import { Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/Badge'

type Page = 'dashboard' | 'templates' | 'editor' | 'texts' | 'songs' | 'history'

interface DashboardPageProps {
  onNavigate: (page: Page) => void
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getTemplates(), getProjects()])
      .then(([t, p]) => { setTemplates(t); setProjects(p) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const recentProjects = projects.slice(0, 3)

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Monta vídeos de dropshipping orgánico en minutos.</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <button
          onClick={() => onNavigate('templates')}
          className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left hover:border-violet-700 hover:bg-zinc-800/60 transition-all cursor-pointer"
        >
          <div className="w-10 h-10 bg-violet-900/40 rounded-lg flex items-center justify-center mb-3 group-hover:bg-violet-800/50 transition-colors">
            <LayoutTemplate size={20} className="text-violet-400" />
          </div>
          <p className="font-semibold text-zinc-100 text-sm">Crear plantilla</p>
          <p className="text-zinc-500 text-xs mt-0.5">Define estructura, slots y timing</p>
        </button>

        <button
          onClick={() => onNavigate('editor')}
          className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left hover:border-violet-700 hover:bg-zinc-800/60 transition-all cursor-pointer"
        >
          <div className="w-10 h-10 bg-violet-900/40 rounded-lg flex items-center justify-center mb-3 group-hover:bg-violet-800/50 transition-colors">
            <Film size={20} className="text-violet-400" />
          </div>
          <p className="font-semibold text-zinc-100 text-sm">Editar vídeo</p>
          <p className="text-zinc-500 text-xs mt-0.5">Elige plantilla, sube clips, exporta</p>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { label: 'Plantillas', value: templates.length, icon: <LayoutTemplate size={16} /> },
          { label: 'Proyectos', value: projects.length, icon: <Film size={16} /> },
          { label: 'Exportados', value: projects.filter(p => p.status === 'done').length, icon: <Clapperboard size={16} /> },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
              {s.icon}
              {s.label}
            </div>
            <p className="text-2xl font-bold text-zinc-100">{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Proyectos recientes</h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('history')}>Ver todos</Button>
          </div>
          <div className="flex flex-col gap-2">
            {recentProjects.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
              >
                <div>
                  <p className="text-sm text-zinc-200">
                    {(p.template as any)?.name ?? 'Sin plantilla'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {new Date(p.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && templates.length === 0 && (
        <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-400 text-sm">Empieza creando tu primera plantilla</p>
          <Button variant="primary" size="sm" className="mt-3" onClick={() => onNavigate('templates')}>
            <Plus size={14} />
            Nueva plantilla
          </Button>
        </div>
      )}
    </div>
  )
}
