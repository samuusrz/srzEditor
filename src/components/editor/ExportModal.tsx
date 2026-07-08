import { useState, useEffect, useRef } from 'react'
import { X, Download, AlertCircle, Clock, CheckCircle } from 'lucide-react'
import { renderVideoInBrowser } from '../../lib/renderVideo'
import type { Clip, TextOverlay, AudioTrack } from '../../types/editor'

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  onClose: () => void
}

type Status = 'idle' | 'rendering' | 'done' | 'error'

function fmtSecs(s: number) {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

// Rough estimate: phase1 = realtime clip duration, phase2 = 12× that for slow preset in WASM
function estimateSeconds(clips: Clip[], isElectron: boolean) {
  const dur = clips.reduce((m, c) => Math.max(m, c.startAt + c.duration), 0)
  if (isElectron) return Math.round(dur + 15) // native FFmpeg is much faster
  return Math.round(dur + dur * 12 + 35) // +35s for FFmpeg load
}

export function ExportModal({ clips, texts, audio, onClose }: Props) {
  const isElectron = typeof (window as any).electronAPI !== 'undefined'
  const [status, setStatus]     = useState<Status>('idle')
  const [progress, setProgress] = useState('')
  const [pct, setPct]           = useState(0)
  const [error, setError]       = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [elapsed, setElapsed]   = useState(0)
  const [totalTime, setTotalTime] = useState(0)
  const startRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (status === 'rendering') {
      startRef.current = Date.now()
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      if (status === 'done') setTotalTime(Math.floor((Date.now() - startRef.current) / 1000))
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  const estimated = estimateSeconds(clips, isElectron)
  const remaining = Math.max(0, estimated - elapsed)

  const handleExport = async () => {
    setStatus('rendering')
    setElapsed(0)
    setError(null)
    setPct(0)
    try {
      const blob = await renderVideoInBrowser(
        clips, texts, audio,
        ({ step, pct }) => { setProgress(step); setPct(pct) },
      )
      if (blob.type === 'video/x-electron-saved') {
        setStatus('done')
      } else {
        setVideoUrl(URL.createObjectURL(blob))
        setStatus('done')
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e))
      setError(msg || 'Error desconocido')
      setStatus('error')
    }
  }

  const handleDownload = () => {
    if (!videoUrl) return
    const a = document.createElement('a')
    a.href = videoUrl
    a.download = `srz_${Date.now()}.mp4`
    a.click()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-100">Exportar vídeo</h2>
          {status !== 'rendering' && (
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Info */}
          {status === 'idle' && (
            <>
              <div className="bg-zinc-800/50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Clips</p>
                  <p className="text-zinc-200 font-medium">{clips.length}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Duración</p>
                  <p className="text-zinc-200 font-medium">
                    {clips.reduce((m, c) => Math.max(m, c.startAt + c.duration), 0).toFixed(1)}s
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Resolución</p>
                  <p className="text-zinc-200 font-medium">1080×1920 · 60 fps</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Calidad</p>
                  <p className="text-zinc-200 font-medium">H.264 CRF 18 · slow</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-800/40 rounded-xl px-4 py-3">
                <Clock size={14} className="text-amber-400 flex-none" />
                <p className="text-sm text-amber-300">
                  Tiempo estimado: <span className="font-semibold">~{fmtSecs(estimated)}</span>
                  <span className="text-amber-600 text-xs ml-1">(varía según el dispositivo)</span>
                </p>
              </div>
            </>
          )}

          {/* Progress */}
          {status === 'rendering' && (
            <div className="flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-300">{progress}</span>
                <span className="text-zinc-500 tabular-nums">{pct}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Transcurrido: <span className="text-zinc-400 tabular-nums">{fmtSecs(elapsed)}</span></span>
                {pct < 98 && (
                  <span>Restante estimado: <span className="text-zinc-400 tabular-nums">~{fmtSecs(remaining)}</span></span>
                )}
              </div>
              <p className="text-xs text-zinc-600">No cierres la pestaña mientras se exporta.</p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="flex items-start gap-3 bg-red-900/20 border border-red-800/50 rounded-xl p-4">
              <AlertCircle size={16} className="text-red-400 mt-0.5 flex-none" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Preview */}
          {status === 'done' && isElectron && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle size={48} className="text-green-400" />
              <p className="text-base font-medium text-zinc-100">Vídeo guardado en tu ordenador</p>
              <p className="text-xs text-zinc-600">Exportado en {fmtSecs(totalTime)}</p>
            </div>
          )}
          {status === 'done' && !isElectron && videoUrl && (
            <div className="flex flex-col gap-2">
              <div className="rounded-xl overflow-hidden bg-black">
                <video src={videoUrl} controls className="w-full max-h-64 object-contain" />
              </div>
              <p className="text-xs text-zinc-600 text-right">Exportado en {fmtSecs(totalTime)}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end mt-1">
            {status !== 'rendering' && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                {status === 'done' ? 'Cerrar' : 'Cancelar'}
              </button>
            )}
            {(status === 'idle' || status === 'error') && (
              <button
                onClick={handleExport}
                disabled={clips.length === 0}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
              >
                Renderizar
              </button>
            )}
            {status === 'done' && !isElectron && videoUrl && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
              >
                <Download size={14} />
                Descargar MP4
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
