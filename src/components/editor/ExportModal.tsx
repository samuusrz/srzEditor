import { useState } from 'react'
import { X, Download, AlertCircle } from 'lucide-react'
import { renderVideoInBrowser } from '../../lib/renderVideo'
import type { Clip, TextOverlay, AudioTrack } from '../../types/editor'

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  onClose: () => void
}

type Status = 'idle' | 'rendering' | 'done' | 'error'

export function ExportModal({ clips, texts, audio, onClose }: Props) {
  const [status, setStatus]   = useState<Status>('idle')
  const [progress, setProgress] = useState('')
  const [pct, setPct]         = useState(0)
  const [error, setError]     = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const handleExport = async () => {
    setStatus('rendering')
    setError(null)
    setPct(0)
    try {
      const blob = await renderVideoInBrowser(
        clips, texts, audio,
        ({ step, pct }) => { setProgress(step); setPct(pct) },
      )
      setVideoUrl(URL.createObjectURL(blob))
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
                <p className="text-zinc-200 font-medium">1080×1920</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Formato</p>
                <p className="text-zinc-200 font-medium">MP4 H.264</p>
              </div>
            </div>
          )}

          {/* Progress */}
          {status === 'rendering' && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-300">{progress}</span>
                <span className="text-zinc-500 tabular-nums">{pct}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-zinc-600">Puede tardar unos minutos. No cierres la pestaña.</p>
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
          {status === 'done' && videoUrl && (
            <div className="rounded-xl overflow-hidden bg-black">
              <video src={videoUrl} controls className="w-full max-h-64 object-contain" />
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
            {status === 'done' && (
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
