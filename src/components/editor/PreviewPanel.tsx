import { useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, Film } from 'lucide-react'
import type { Clip, TextOverlay, SelectedItem } from '../../types/editor'

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  playhead: number
  playing: boolean
  totalDuration: number
  selected: SelectedItem
  onSetPlayhead: (t: number) => void
  onSetPlaying: (p: boolean) => void
  onUpdateText: (id: string, patch: Partial<TextOverlay>) => void
  onSelect: (item: SelectedItem) => void
}

function fmt(t: number) {
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

export function PreviewPanel({
  clips, texts, playhead, playing, totalDuration, selected,
  onSetPlayhead, onSetPlaying, onUpdateText, onSelect,
}: Props) {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const previewRef    = useRef<HTMLDivElement>(null)
  const playheadRef   = useRef(playhead)
  const rafRef        = useRef(0)
  const lastTimeRef   = useRef(0)
  const prevClipIdRef = useRef<string | null>(null)

  playheadRef.current = playhead

  const activeClip  = clips.find(c => c.startAt <= playhead && playhead < c.startAt + c.duration) ?? null
  const activeTexts = texts.filter(t => t.startAt <= playhead && playhead < t.startAt + t.duration)

  // ── Sync video ───────────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    if (!activeClip) { vid.pause(); return }

    const targetTime = activeClip.trimStart + (playhead - activeClip.startAt)
    vid.volume = activeClip.muted ? 0 : activeClip.volume
    vid.muted  = activeClip.muted

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

  // ── RAF playback ─────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!playing) { videoRef.current?.pause(); return }

    videoRef.current?.play().catch(() => {})
    lastTimeRef.current = performance.now()

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now
      const next = playheadRef.current + dt
      if (next >= totalDuration) { onSetPlaying(false); onSetPlayhead(0); return }
      onSetPlayhead(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, totalDuration])

  // ── Text drag in preview ─────────────────────────────────────────────────
  const startTextDrag = useCallback((e: React.MouseEvent, text: TextOverlay) => {
    e.stopPropagation()
    onSelect({ type: 'text', id: text.id })
    const rect   = previewRef.current!.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const origX  = text.x
    const origY  = text.y

    const onMove = (ev: MouseEvent) => {
      const dxPct = (ev.clientX - startX) / rect.width * 100
      const dyPct = (ev.clientY - startY) / rect.height * 100
      onUpdateText(text.id, {
        x: Math.max(0, Math.min(100, origX + dxPct)),
        y: Math.max(0, Math.min(100, origY + dyPct)),
      })
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onUpdateText, onSelect])

  // ── Text resize handle ───────────────────────────────────────────────────
  const startTextResize = useCallback((e: React.MouseEvent, text: TextOverlay) => {
    e.stopPropagation()
    const startY = e.clientY
    const origFs = text.fontSize

    const onMove = (ev: MouseEvent) => {
      const newFs = Math.max(10, Math.min(200, origFs + (ev.clientY - startY) * 0.5))
      onUpdateText(text.id, { fontSize: Math.round(newFs) })
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onUpdateText])

  const selTextId = selected?.type === 'text' ? selected.id : null

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 gap-3 py-4 min-h-0">
      {/* 9:16 preview */}
      <div
        ref={previewRef}
        className="relative bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-2xl flex-shrink"
        style={{ aspectRatio: '9/16', maxHeight: 'calc(100% - 56px)', minWidth: 0 }}
        onClick={() => onSelect(null)}
      >
        <video ref={videoRef} className="w-full h-full object-contain" playsInline />

        {/* Text overlays */}
        {activeTexts.map(t => {
          const isSelected = t.id === selTextId
          return (
            <div
              key={t.id}
              className={`absolute group ${isSelected ? 'ring-2 ring-violet-400 ring-offset-0 rounded' : ''}`}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'move',
                userSelect: 'none',
              }}
              onMouseDown={e => startTextDrag(e, t)}
              onClick={e => { e.stopPropagation(); onSelect({ type: 'text', id: t.id }) }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: t.fontSize,
                  color: t.color,
                  fontWeight: t.bold ? 700 : 400,
                  fontFamily: "'TikTok Sans', sans-serif",
                  WebkitTextStroke: '3px black',
                  paintOrder: 'stroke fill',
                  whiteSpace: 'pre',
                  textAlign: 'center',
                  lineHeight: 1.15,
                }}
              >
                {t.content}
              </span>
              {/* Resize handle — bottom-right corner */}
              {isSelected && (
                <div
                  className="absolute -bottom-2 -right-2 w-4 h-4 bg-violet-500 rounded-full border-2 border-white cursor-se-resize z-10"
                  onMouseDown={e => startTextResize(e, t)}
                />
              )}
            </div>
          )
        })}

        {clips.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 gap-2">
            <Film size={32} />
            <p className="text-sm">Importa clips para empezar</p>
          </div>
        )}
      </div>

      {/* Controls */}
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
