import { useEffect, useState } from 'react'
import { History, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { getProjects, getPublicUrl } from '../lib/db'
import type { VideoProject } from '../types'
import { Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'

export function HistoryPage() {
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    getProjects().then(setProjects).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Historial de proyectos</h1>
          <p className="text-zinc-500 text-sm mt-1">Todos tus vídeos exportados</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw size={13} />
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<History size={48} />}
          title="Sin proyectos todavía"
          description="Los vídeos exportados aparecerán aquí"
        />
      ) : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {projects.map(p => (
            <div
              key={p.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-100">
                  {(p.template as any)?.name ?? 'Sin plantilla'}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {new Date(p.created_at).toLocaleDateString('es-ES', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5 font-mono truncate">{p.id}</p>
              </div>

              <StatusBadge status={p.status} />

              {p.status === 'done' && p.final_video_path && (
                <div className="flex gap-1">
                  <a
                    href={getPublicUrl(p.final_video_path)}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                  >
                    <Download size={12} />
                    Descargar
                  </a>
                  <a
                    href={getPublicUrl(p.final_video_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {p.status === 'rendering' && (
                <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
