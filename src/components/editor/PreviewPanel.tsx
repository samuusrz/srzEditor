import { useRef, useEffect, useCallback, useState } from 'react'
import { Play, Pause, SkipBack, Film } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem } from '../../types/editor'
import { getVolumeAtTime } from './Timeline'

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  playhead: number
  playing: boolean
  totalDuration: number
  selected: SelectedItem
  onSetPlayhead: (t: number) => void
  onSetPlaying: (p: boolean) => void
  onUpdateText: (id: string, patch: Partial<TextOverlay>) => void
  onDragTextPos: (id: string, x: number, y: number) => void
  onSelect: (item: SelectedItem) => void
  onSnapshot: () => void
}

function fmt(t: number) {
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function calcFadeVolume(t: number, duration: number, fadeIn: number, fadeOut: number, base: number) {
  let vol = base
  if (fadeIn > 0 && t < fadeIn) vol *= t / fadeIn
  if (fadeOut > 0 && t > duration - fadeOut) vol *= (duration - t) / fadeOut
  return Math.max(0, Math.min(1, vol))
}

const SNAP = 2.5  // % threshold to trigger snap

export function PreviewPanel({
  clips, texts, audio, playhead, playing, totalDuration, selected,
  onSetPlayhead, onSetPlaying, onUpdateText, onDragTextPos, onSelect, onSnapshot,
}: Props) {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const audioRef      = useRef<HTMLAudioElement>(null)
  const previewRef    = useRef<HTMLDivElement>(null)
  const playheadRef   = useRef(playhead)
  const audioTrackRef = useRef(audio)
  const rafRef        = useRef(0)
  const lastTimeRef   = useRef(0)
  const prevClipIdRef = useRef<string | null>(null)
  const prevAudioUrl  = useRef<string | null>(null)

  playheadRef.current = playhead
  audioTrackRef.current = audio

  const activeClip  = clips.find(c => c.startAt <= playhead && playhead < c.startAt + c.duration) ?? null
  const activeTexts = texts.filter(t => t.startAt <= playhead && playhead < t.startAt + t.duration)
  const selTextId   = selected?.type === 'text' ? selected.id : null

  // Snap guide state
  const [guides, setGuides] = useState<{
    vCenter?: boolean; hCenter?: boolean; vThird1?: boolean; vThird2?: boolean; hThird1?: boolean
  }>({})

  // ── Sync video ──────────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    if (!activeClip) { vid.pause(); return }

    const targetTime = activeClip.trimStart + (playhead - activeClip.startAt)
    vid.volume = activeClip.muted ? 0 : Math.max(0, Math.min(1, activeClip.volume))
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

  // ── Sync audio track ────────────────────────────────────────────────────
  useEffect(() => {
    const aud = audioRef.current
    if (!aud || !audio) { audioRef.current?.pause(); return }

    const audioTime = playhead - audio.startAt

    if (prevAudioUrl.current !== audio.localUrl) {
      prevAudioUrl.current = audio.localUrl
      aud.src = audio.localUrl
      aud.load()
    }

    if (audioTime < 0 || audioTime >= audio.duration) {
      aud.pause()
      return
    }

    const baseVol = getVolumeAtTime(playhead, audio.keyframes, audio.volume)
    aud.volume = calcFadeVolume(audioTime, audio.duration, audio.fadeIn, audio.fadeOut, baseVol)

    if (!playing) {
      aud.pause()
      if (Math.abs(aud.currentTime - audioTime) > 0.15) aud.currentTime = audioTime
    } else {
      if (Math.abs(aud.currentTime - audioTime) > 0.3) aud.currentTime = audioTime
      aud.play().catch(() => {})
    }
  }, [audio, playhead, playing])

  // ── RAF playback loop ───────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!playing) { videoRef.current?.pause(); audioRef.current?.pause(); return }

    videoRef.current?.play().catch(() => {})
    lastTimeRef.current = performance.now()

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now
      const next = playheadRef.current + dt

      // Update audio volume every frame using latest keyframes via ref
      const aud = audioRef.current
      const at  = audioTrackRef.current
      if (aud && at) {
        const audioTime = next - at.startAt
        if (audioTime >= 0 && audioTime < at.duration) {
          const baseVol = getVolumeAtTime(next, at.keyframes, at.volume)
          aud.volume = calcFadeVolume(audioTime, at.duration, at.fadeIn, at.fadeOut, baseVol)
          if (aud.paused) aud.play().catch(() => {})
        } else {
          if (!aud.paused) aud.pause()
        }
      }

      if (next >= totalDuration) { onSetPlaying(false); onSetPlayhead(0); return }
      onSetPlayhead(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, totalDuration])

  // ── Text drag with snap guides ──────────────────────────────────────────
  const startTextDrag = useCallback((e: React.MouseEvent, text: TextOverlay) => {
    e.stopPropagation()
    onSelect({ type: 'text', id: text.id })
    const rect   = previewRef.current!.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const origX  = text.x
    const origY  = text.y

    const onMove = (ev: MouseEvent) => {
      let nx = Math.max(0, Math.min(100, origX + (ev.clientX - startX) / rect.width * 100))
      let ny = Math.max(0, Math.min(100, origY + (ev.clientY - startY) / rect.height * 100))

      const g: typeof guides = {}
      if (Math.abs(nx - 50)   < SNAP) { nx = 50;   g.vCenter = true }
      if (Math.abs(nx - 33.3) < SNAP) { nx = 33.3; g.vThird1 = true }
      if (Math.abs(nx - 66.7) < SNAP) { nx = 66.7; g.vThird2 = true }
      if (Math.abs(ny - 50)   < SNAP) { ny = 50;   g.hCenter = true }
      if (Math.abs(ny - 33.3) < SNAP) { ny = 33.3; g.hThird1 = true }
      setGuides(g)
      onDragTextPos(text.id, nx, ny)
    }
    const onUp = () => {
      setGuides({})
      onSnapshot()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onDragTextPos, onSelect])

  // ── Text resize handle ──────────────────────────────────────────────────
  const startTextResize = useCallback((e: React.MouseEvent, text: TextOverlay) => {
    e.stopPropagation()
    const startY = e.clientY
    const origFs = text.fontSize
    const onMove = (ev: MouseEvent) => onUpdateText(text.id, { fontSize: Math.max(8, Math.round(origFs + (ev.clientY - startY) * 0.4)) })
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onUpdateText])

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 gap-3 py-4 min-h-0">
      {/* Hidden audio element for audio track */}
      <audio ref={audioRef} preload="auto" />

      {/* 9:16 preview */}
      <div
        ref={previewRef}
        className="relative bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-2xl flex-shrink"
        style={{ aspectRatio: '9/16', maxHeight: 'calc(100% - 56px)', minWidth: 0 }}
        onClick={() => onSelect(null)}
      >
        <video ref={videoRef} className="w-full h-full object-contain" playsInline />

        {/* Snap guides */}
        {guides.vCenter && <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: '50%', width: 1, background: 'rgba(139,92,246,0.7)' }} />}
        {guides.hCenter && <div className="absolute left-0 right-0 pointer-events-none" style={{ top: '50%', height: 1, background: 'rgba(139,92,246,0.7)' }} />}
        {guides.vThird1 && <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: '33.3%', width: 1, background: 'rgba(139,92,246,0.45)' }} />}
        {guides.vThird2 && <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: '66.7%', width: 1, background: 'rgba(139,92,246,0.45)' }} />}
        {guides.hThird1 && <div className="absolute left-0 right-0 pointer-events-none" style={{ top: '33.3%', height: 1, background: 'rgba(139,92,246,0.45)' }} />}

        {/* Text overlays */}
        {activeTexts.map(t => {
          const isSelected = t.id === selTextId
          return (
            <div
              key={t.id}
              className={`absolute ${isSelected ? 'outline outline-2 outline-violet-400 outline-offset-2 rounded-sm' : ''}`}
              style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%,-50%)', cursor: 'move', userSelect: 'none' }}
              onMouseDown={e => startTextDrag(e, t)}
              onClick={e => { e.stopPropagation(); onSelect({ type: 'text', id: t.id }) }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: t.fontSize,
                  color: t.color,
                  fontWeight: 900,
                  fontFamily: "'TikTok Sans', sans-serif",
                  WebkitTextStroke: '4px #000',
                  paintOrder: 'stroke fill',
                  whiteSpace: 'pre',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {t.content}
              </span>
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
        <button onClick={() => { onSetPlayhead(0); onSetPlaying(false) }} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
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
