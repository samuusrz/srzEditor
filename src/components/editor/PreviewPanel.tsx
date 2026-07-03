import { useRef, useEffect } from 'react'
import { Play, Pause, SkipBack, Film } from 'lucide-react'
import type { Clip, TextOverlay } from '../../types/editor'

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  playhead: number
  playing: boolean
  totalDuration: number
  onSetPlayhead: (t: number) => void
  onSetPlaying: (p: boolean) => void
}

function fmt(t: number) {
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

export function PreviewPanel({
  clips, texts, playhead, playing, totalDuration, onSetPlayhead, onSetPlaying,
}: Props) {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const playheadRef   = useRef(playhead)
  const rafRef        = useRef(0)
  const lastTimeRef   = useRef(0)
  const prevClipIdRef = useRef<string | null>(null)

  playheadRef.current = playhead

  const activeClip  = clips.find(c => c.startAt <= playhead && playhead < c.startAt + c.duration) ?? null
  const activeTexts = texts.filter(t => t.startAt <= playhead && playhead < t.startAt + t.duration)

  // Sync video element to playhead
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    if (!activeClip) { vid.pause(); return }

    const targetTime = activeClip.trimStart + (playhead - activeClip.startAt)

    if (prevClipIdRef.current !== activeClip.id) {
      prevClipIdRef.current = activeClip.id
      vid.src = activeClip.localUrl
      vid.load()
      vid.currentTime = targetTime
      if (playing) vid.play().catch(() => {})
    } else if (!playing) {
      vid.pause()
      if (Math.abs(vid.currentTime - targetTime) > 0.1) vid.currentTime = targetTime
    }
  }, [activeClip?.id, playhead, playing])

  // RAF loop for playback
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!playing) { videoRef.current?.pause(); return }

    videoRef.current?.play().catch(() => {})
    lastTimeRef.current = performance.now()

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now
      const next = playheadRef.current + dt
      if (next >= totalDuration) {
        onSetPlaying(false)
        onSetPlayhead(0)
        return
      }
      onSetPlayhead(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, totalDuration])

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 gap-3 py-4 min-h-0">
      {/* 9:16 preview box */}
      <div
        className="relative bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-2xl flex-shrink"
        style={{ aspectRatio: '9/16', maxHeight: 'calc(100% - 56px)', minWidth: 0 }}
      >
        <video ref={videoRef} className="w-full h-full object-contain" playsInline />

        {/* Text overlays */}
        {activeTexts.map(t => (
          <div
            key={t.id}
            className="absolute pointer-events-none select-none"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: t.fontSize,
              color: t.color,
              fontWeight: t.bold ? 700 : 400,
              textShadow: '0 1px 10px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1)',
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              maxWidth: '90%',
            }}
          >
            {t.content}
          </div>
        ))}

        {clips.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 gap-2">
            <Film size={32} />
            <p className="text-sm">Importa clips para empezar</p>
          </div>
        )}
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => { onSetPlayhead(0); onSetPlaying(false) }}
          className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={() => onSetPlaying(!playing)}
          disabled={clips.length === 0}
          className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-colors disabled:opacity-30 cursor-pointer"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="text-xs font-mono text-zinc-400 tabular-nums">
          {fmt(playhead)} / {fmt(totalDuration)}
        </span>
      </div>
    </div>
  )
}
