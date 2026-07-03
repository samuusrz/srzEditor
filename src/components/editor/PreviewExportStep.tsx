import { useState } from 'react'
import { Download, RefreshCw, Send, Film, Music, Type, Clock, AlertCircle } from 'lucide-react'
import { renderVideoInBrowser } from '../../lib/renderVideo'
import type { TemplateWithSlots, ProjectClip, ProjectText, SongLibraryItem } from '../../types'
import { Button } from '../ui/Button'

interface PreviewExportStepProps {
  template: TemplateWithSlots
  clips: ProjectClip[]
  texts: ProjectText[]
  audio: { song: SongLibraryItem; startAt: number } | null
  onBack: () => void
  onReset: () => void
}

type ExportStatus = 'idle' | 'rendering' | 'done' | 'error'

export function PreviewExportStep({
  template,
  clips,
  texts,
  audio,
  onBack,
  onReset,
}: PreviewExportStepProps) {
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [progress, setProgress] = useState('')
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const totalDuration = clips.reduce((sum, c) => {
    const slot = template.clip_slots.find(s => s.id === c.slot_id)
    return sum + (c.duration_override ?? slot?.duration ?? 0)
  }, 0)

  const handleExport = async () => {
    setStatus('rendering')
    setError(null)
    setVideoUrl(null)
    setPct(0)
    try {
      const blob = await renderVideoInBrowser(
        template,
        clips,
        texts,
        audio,
        ({ step, pct }) => {
          setProgress(step)
          setPct(pct)
        },
      )
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      setStatus('done')
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
      setStatus('error')
    }
  }

  const handleDownload = () => {
    if (!videoUrl) return
    const a = document.createElement('a')
    a.href = videoUrl
    a.download = `srz_video_${Date.now()}.mp4`
    a.click()
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Resumen y exportar</h2>
      <p className="text-zinc-500 text-sm mb-6">Revisa el proyecto antes de exportar</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Film size={13} />
            Clips
          </div>
          <p className="text-2xl font-bold text-zinc-100">{clips.length}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {clips.length !== template.clip_slots.length ? (
              <span className="text-yellow-400">⚠ Se esperan {template.clip_slots.length}</span>
            ) : 'Completos'}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Clock size={13} />
            Duración
          </div>
          <p className="text-2xl font-bold text-zinc-100">{totalDuration.toFixed(1)}s</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {totalDuration > 25 ? <span className="text-red-400">Supera los 25s</span> : 'Dentro del límite'}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Type size={13} />
            Textos
          </div>
          <p className="text-2xl font-bold text-zinc-100">{texts.filter(t => t.final_text.trim()).length}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{texts.length} slot(s) total</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Music size={13} />
            Música
          </div>
          <p className="text-sm font-semibold text-zinc-100 truncate">{audio?.song.name ?? '—'}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {audio ? `Entra en ${audio.startAt}s` : 'Sin música'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {status === 'rendering' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-300">{progress}</p>
            <p className="text-sm text-zinc-500">{pct}%</p>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div
              className="bg-violet-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5 text-sm bg-red-900/20 border border-red-800/50 text-red-300">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          {error}
        </div>
      )}

      {/* Video preview */}
      {status === 'done' && videoUrl && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
          <video
            src={videoUrl}
            controls
            className="w-full rounded-lg max-h-72 bg-black"
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={status === 'rendering'}>
          Atrás
        </Button>
        <div className="flex gap-3">
          {(status === 'done' || status === 'error') && (
            <Button variant="ghost" onClick={onReset}>
              <RefreshCw size={13} />
              Nuevo vídeo
            </Button>
          )}
          {status === 'done' && videoUrl ? (
            <Button variant="primary" onClick={handleDownload}>
              <Download size={14} />
              Descargar MP4
            </Button>
          ) : status !== 'rendering' ? (
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={clips.length === 0}
            >
              <Send size={14} />
              Exportar vídeo
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
