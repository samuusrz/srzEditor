import { useState } from 'react'
import { Download, RefreshCw, Send, Film, Music, Type, Clock, AlertCircle } from 'lucide-react'
import { createProject, uploadClip, upsertProjectClips, upsertProjectTexts, upsertProjectAudio } from '../../lib/db'
import type { TemplateWithSlots, ProjectClip, ProjectText, SongLibraryItem, RenderPayload } from '../../types'
import { Button } from '../ui/Button'

interface PreviewExportStepProps {
  template: TemplateWithSlots
  clips: ProjectClip[]
  texts: ProjectText[]
  audio: { song: SongLibraryItem; startAt: number } | null
  onBack: () => void
  onReset: () => void
}

type ExportStatus = 'idle' | 'uploading' | 'saving' | 'rendering' | 'done' | 'error'

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
  const [error, setError] = useState<string | null>(null)
  const [_projectId, setProjectId] = useState<string | null>(null)
  const [payload, setPayload] = useState<RenderPayload | null>(null)

  const totalDuration = clips.reduce((sum, c) => {
    const slot = template.clip_slots.find(s => s.id === c.slot_id)
    return sum + (c.duration_override ?? slot?.duration ?? 0)
  }, 0)

  const handleExport = async () => {
    setStatus('uploading')
    setError(null)
    try {
      // 1. Create project record
      setProgress('Creando proyecto...')
      const pid = await createProject(template.id)
      setProjectId(pid)

      // 2. Upload clips
      setProgress('Subiendo clips...')
      const uploadedPaths: string[] = []
      for (let i = 0; i < clips.length; i++) {
        setProgress(`Subiendo clip ${i + 1}/${clips.length}...`)
        const clip = clips[i]
        if (!clip.file) throw new Error(`Clip ${i + 1} no tiene archivo`)
        const path = await uploadClip(pid, clip.file)
        uploadedPaths.push(path)
      }

      // 3. Save clips to DB
      setStatus('saving')
      setProgress('Guardando en base de datos...')
      await upsertProjectClips(
        pid,
        clips.map((clip, i) => ({
          slot_id: clip.slot_id,
          storage_path: uploadedPaths[i],
          duration_override: clip.duration_override ?? null,
        })),
      )

      if (texts.length > 0) {
        await upsertProjectTexts(
          pid,
          texts.map(t => ({
            text_slot_id: t.text_slot_id,
            final_text: t.final_text,
            position_override_x: t.position_override_x ?? null,
            position_override_y: t.position_override_y ?? null,
          })),
        )
      }

      if (audio) {
        await upsertProjectAudio(pid, audio.song.id, audio.startAt)
      }

      // 4. Build render payload
      setStatus('rendering')
      setProgress('Preparando payload de render...')

      let cursor = 0
      const renderPayload: RenderPayload = {
        project_id: pid,
        output: { resolution: '1080x1920', fps: template.fps, format: 'mp4' },
        clips: clips.map((clip, i) => {
          const slot = template.clip_slots.find(s => s.id === clip.slot_id)
          const dur = clip.duration_override ?? slot?.duration ?? 3
          const item = { slot_order: i + 1, storage_path: uploadedPaths[i], start_at: cursor, duration: dur }
          cursor += dur
          return item
        }),
        texts: texts.map(t => {
          const slot = template.text_slots.find(s => s.id === t.text_slot_id)
          return {
            content: t.final_text,
            x: t.position_override_x ?? slot?.position_x ?? 50,
            y: t.position_override_y ?? slot?.position_y ?? 10,
            start_at: slot?.start_at ?? 0,
            end_at: slot?.end_at ?? 3,
          }
        }),
        audio: audio
          ? { storage_path: audio.song.storage_path, start_at: audio.startAt }
          : null,
      }
      setPayload(renderPayload)

      // 5. Call render service
      const renderUrl = import.meta.env.VITE_RENDER_SERVICE_URL
      if (!renderUrl) {
        setProgress('Payload listo — servicio de render no configurado (ver VITE_RENDER_SERVICE_URL)')
        setStatus('done')
        return
      }

      setProgress('Enviando al servicio de render...')
      const res = await fetch(`${renderUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderPayload),
      })
      if (!res.ok) throw new Error(`Render service error: ${res.status}`)
      setProgress('Render en proceso — el vídeo estará disponible en el historial')
      setStatus('done')
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
      setStatus('error')
    }
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
            {clips.length !== template.clip_slots.length && (
              <span className="text-yellow-400">
                ⚠ Se esperan {template.clip_slots.length}
              </span>
            )}
            {clips.length === template.clip_slots.length && 'Completos'}
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

      {/* Payload preview */}
      {payload && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1">
            Payload de render generado
          </p>
          <pre className="text-xs text-zinc-500 overflow-auto max-h-40 font-mono">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}

      {/* Status */}
      {status !== 'idle' && (
        <div className={`
          flex items-center gap-3 rounded-xl px-4 py-3 mb-5 text-sm
          ${status === 'error' ? 'bg-red-900/20 border border-red-800/50 text-red-300' : 'bg-zinc-900 border border-zinc-800 text-zinc-300'}
        `}>
          {status === 'error' ? (
            <AlertCircle size={16} className="text-red-400 shrink-0" />
          ) : status === 'done' ? (
            <Film size={16} className="text-green-400 shrink-0" />
          ) : (
            <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          {error || progress}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={status !== 'idle' && status !== 'error' && status !== 'done'}>
          Atrás
        </Button>
        <div className="flex gap-3">
          {(status === 'done' || status === 'error') && (
            <Button variant="ghost" onClick={onReset}>
              <RefreshCw size={13} />
              Nuevo vídeo
            </Button>
          )}
          {status === 'idle' || status === 'error' ? (
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={clips.length === 0}
            >
              <Send size={14} />
              Exportar vídeo
            </Button>
          ) : status === 'done' ? (
            <Button variant="secondary" disabled>
              <Download size={14} />
              Ver en historial
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
