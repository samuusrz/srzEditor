import { useCallback } from 'react'
import { ZoomIn, ZoomOut, Scissors, Volume2, VolumeX, Layers } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem } from '../../types/editor'

const TRACK_H = 48
const RULER_H = 24
const LABEL_W = 72

const CLIP_COLORS = [
  'bg-violet-600', 'bg-blue-600', 'bg-teal-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600',
]

function fmt(t: number) {
  if (t < 60) return `${t.toFixed(1)}s`
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(0).padStart(2, '0')}`
}

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  playhead: number
  totalDuration: number
  zoom: number
  selected: SelectedItem
  onSetPlayhead: (t: number) => void
  onMoveClip: (id: string, startAt: number) => void
  onTrimClip: (id: string, trimStart: number, duration: number, startAt: number) => void
  onSplitClip: (clipId: string, at: number) => void
  onToggleMute: (id: string) => void
  onExtractAudio: (clipId: string) => void
  onMoveText: (id: string, startAt: number) => void
  onMoveAudio: (patch: { startAt: number }) => void
  onSelect: (item: SelectedItem) => void
  onSetZoom: (z: number) => void
}

export function Timeline({
  clips, texts, audio, playhead, totalDuration, zoom, selected,
  onSetPlayhead, onMoveClip, onTrimClip, onSplitClip, onToggleMute,
  onExtractAudio, onMoveText, onMoveAudio, onSelect, onSetZoom,
}: Props) {
  const visibleSecs = Math.max(totalDuration + 5, 15)
  const totalWidth  = visibleSecs * zoom

  const tickStep = zoom >= 150 ? 1 : zoom >= 70 ? 2 : 5
  const ticks: number[] = []
  for (let t = 0; t <= visibleSecs; t += tickStep) ticks.push(t)

  const selClipId = selected?.type === 'clip' ? selected.id : null
  const selTextId = selected?.type === 'text' ? selected.id : null
  const isAudioSel = selected?.type === 'audio'

  // ── Ruler click → seek ──────────────────────────────────────────────────
  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onSetPlayhead(Math.max(0, (e.clientX - rect.left) / zoom))
  }, [zoom, onSetPlayhead])

  // ── Clip body drag (move) ───────────────────────────────────────────────
  const startClipDrag = useCallback((e: React.MouseEvent, clip: Clip) => {
    e.stopPropagation()
    onSelect({ type: 'clip', id: clip.id })
    const startX = e.clientX
    const origStart = clip.startAt
    const onMove = (ev: MouseEvent) => onMoveClip(clip.id, Math.max(0, origStart + (ev.clientX - startX) / zoom))
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [zoom, onMoveClip, onSelect])

  // ── Clip trim handles ───────────────────────────────────────────────────
  const startTrimDrag = useCallback((e: React.MouseEvent, clip: Clip, side: 'left' | 'right') => {
    e.stopPropagation()
    const startX      = e.clientX
    const origStart   = clip.startAt
    const origTrim    = clip.trimStart
    const origDur     = clip.duration
    const maxDur      = clip.originalDuration - clip.trimStart

    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) / zoom
      if (side === 'right') {
        const newDur = Math.max(0.1, Math.min(maxDur, origDur + delta))
        onTrimClip(clip.id, origTrim, newDur, origStart)
      } else {
        const newTrim  = Math.max(0, Math.min(origTrim + origDur - 0.1, origTrim + delta))
        const trimmed  = newTrim - origTrim
        const newDur   = origDur - trimmed
        const newStart = origStart + trimmed
        onTrimClip(clip.id, newTrim, newDur, newStart)
      }
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [zoom, onTrimClip])

  // ── Text drag ───────────────────────────────────────────────────────────
  const startTextDrag = useCallback((e: React.MouseEvent, text: TextOverlay) => {
    e.stopPropagation()
    onSelect({ type: 'text', id: text.id })
    const startX = e.clientX
    const origStart = text.startAt
    const onMove = (ev: MouseEvent) => onMoveText(text.id, Math.max(0, origStart + (ev.clientX - startX) / zoom))
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [zoom, onMoveText, onSelect])

  // ── Audio drag ──────────────────────────────────────────────────────────
  const startAudioDrag = useCallback((e: React.MouseEvent) => {
    if (!audio) return
    e.stopPropagation()
    onSelect({ type: 'audio' })
    const startX = e.clientX
    const origStart = audio.startAt
    const onMove = (ev: MouseEvent) => onMoveAudio({ startAt: Math.max(0, origStart + (ev.clientX - startX) / zoom) })
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [audio, zoom, onMoveAudio, onSelect])

  // ── Split active clip ───────────────────────────────────────────────────
  const handleSplit = useCallback(() => {
    if (!selClipId) {
      // Find clip at playhead
      const clip = clips.find(c => c.startAt <= playhead && playhead < c.startAt + c.duration)
      if (clip) onSplitClip(clip.id, playhead)
    } else {
      onSplitClip(selClipId, playhead)
    }
  }, [selClipId, clips, playhead, onSplitClip])

  return (
    <div className="h-[216px] flex-none bg-zinc-900 border-t border-zinc-800 flex flex-col select-none">

      {/* Controls row */}
      <div className="h-9 flex items-center gap-2 px-4 border-b border-zinc-800 flex-none">
        <button onClick={() => onSetZoom(zoom - 20)} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer" title="Alejar">
          <ZoomOut size={14} />
        </button>
        <input type="range" min={40} max={400} step={10} value={zoom} onChange={e => onSetZoom(+e.target.value)} className="w-24 accent-violet-500" />
        <button onClick={() => onSetZoom(zoom + 20)} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer" title="Acercar">
          <ZoomIn size={14} />
        </button>
        <div className="w-px h-4 bg-zinc-700 mx-1" />

        {/* Split button */}
        <button
          onClick={handleSplit}
          disabled={clips.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
          title="Cortar clip en el playhead"
        >
          <Scissors size={12} />
          Cortar
        </button>

        {/* Mute / Volume — show when clip selected */}
        {selClipId && (() => {
          const clip = clips.find(c => c.id === selClipId)
          if (!clip) return null
          return (
            <>
              <div className="w-px h-4 bg-zinc-700 mx-1" />
              <button
                onClick={() => onToggleMute(selClipId)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                title={clip.muted ? 'Activar sonido' : 'Silenciar'}
              >
                {clip.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                {clip.muted ? 'Sin sonido' : 'Con sonido'}
              </button>
              <button
                onClick={() => onExtractAudio(selClipId)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Separar audio del vídeo"
              >
                <Layers size={12} />
                Extraer audio
              </button>
            </>
          )
        })()}
      </div>

      {/* Tracks */}
      <div className="flex-1 flex overflow-hidden">
        {/* Labels */}
        <div className="flex-none border-r border-zinc-800" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} />
          <TrackLabel>Vídeo</TrackLabel>
          <TrackLabel>Texto</TrackLabel>
          <TrackLabel>Audio</TrackLabel>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden relative">
          <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>

            {/* Ruler */}
            <div
              className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 cursor-pointer"
              style={{ height: RULER_H }}
              onClick={handleRulerClick}
            >
              {ticks.map(t => (
                <div key={t} className="absolute flex flex-col items-start" style={{ left: t * zoom }}>
                  <span className="text-[10px] text-zinc-500 ml-1 leading-none mt-0.5">{fmt(t)}</span>
                  <div className="w-px h-2 bg-zinc-700 mt-0.5 ml-0" />
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: playhead * zoom }}>
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-1 mt-4" />
              <div className="w-px h-full bg-red-500/80 -ml-px" />
            </div>

            {/* ── Video track ── */}
            <div className="relative" style={{ height: TRACK_H }}>
              {clips.map((clip, i) => {
                const w = Math.max(4, clip.duration * zoom)
                const isSelected = clip.id === selClipId
                return (
                  <div
                    key={clip.id}
                    className={`absolute top-1 bottom-1 rounded-md overflow-hidden border-2 transition-[border-color] ${CLIP_COLORS[i % CLIP_COLORS.length]} ${isSelected ? 'border-white' : 'border-transparent'}`}
                    style={{ left: clip.startAt * zoom, width: w }}
                    onClick={() => onSelect({ type: 'clip', id: clip.id })}
                  >
                    {/* Thumbnail background */}
                    {clip.thumbnail && <img src={clip.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-30" alt="" />}

                    {/* Body drag zone */}
                    <div
                      className="absolute inset-x-3 inset-y-0 cursor-grab active:cursor-grabbing flex items-center gap-1"
                      onMouseDown={e => startClipDrag(e, clip)}
                    >
                      {clip.muted && <VolumeX size={10} className="text-white/60 flex-none" />}
                      <span className="text-[10px] text-white font-medium truncate drop-shadow flex-1">{clip.name}</span>
                      <span className="text-[10px] text-white/60 flex-none ml-auto pr-1">{clip.duration.toFixed(1)}s</span>
                    </div>

                    {/* Left trim handle */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2.5 cursor-w-resize hover:bg-white/30 z-10"
                      onMouseDown={e => startTrimDrag(e, clip, 'left')}
                    />
                    {/* Right trim handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-e-resize hover:bg-white/30 z-10"
                      onMouseDown={e => startTrimDrag(e, clip, 'right')}
                    />
                  </div>
                )
              })}
            </div>

            {/* ── Text track ── */}
            <div className="relative" style={{ height: TRACK_H }}>
              {texts.map(t => {
                const w = Math.max(4, t.duration * zoom)
                const isSelected = t.id === selTextId
                return (
                  <div
                    key={t.id}
                    className={`absolute top-1 bottom-1 rounded-md overflow-hidden border-2 bg-amber-500/30 cursor-grab active:cursor-grabbing transition-[border-color] ${isSelected ? 'border-amber-400' : 'border-amber-600/50'}`}
                    style={{ left: t.startAt * zoom, width: w }}
                    onMouseDown={e => startTextDrag(e, t)}
                    onClick={() => onSelect({ type: 'text', id: t.id })}
                  >
                    <div className="absolute inset-x-1.5 inset-y-0 flex items-center gap-1">
                      <span className="text-[10px] text-amber-200 truncate flex-1">{t.content || 'Texto'}</span>
                      <span className="text-[10px] text-amber-200/50 flex-none">{t.duration.toFixed(1)}s</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Audio track ── */}
            <div className="relative" style={{ height: TRACK_H }}>
              {audio && (() => {
                const w = Math.max(4, audio.duration * zoom)
                return (
                  <div
                    className={`absolute top-1 bottom-1 rounded-md overflow-hidden border-2 bg-emerald-600/40 cursor-grab active:cursor-grabbing transition-[border-color] ${isAudioSel ? 'border-emerald-400' : 'border-emerald-700/60'}`}
                    style={{ left: audio.startAt * zoom, width: w }}
                    onMouseDown={startAudioDrag}
                    onClick={() => onSelect({ type: 'audio' })}
                  >
                    <Waveform />
                    <div className="absolute inset-x-1.5 inset-y-0 flex items-center gap-1 z-10">
                      <span className="text-[10px] text-emerald-200 truncate flex-1">{audio.name}</span>
                      <span className="text-[10px] text-emerald-200/50 flex-none">{audio.duration.toFixed(1)}s</span>
                    </div>
                  </div>
                )
              })()}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

function TrackLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center px-2 text-[11px] text-zinc-500" style={{ height: TRACK_H }}>
      {children}
    </div>
  )
}

function Waveform() {
  return (
    <div className="absolute inset-0 flex items-center gap-px px-1 opacity-30 overflow-hidden">
      {Array.from({ length: 100 }).map((_, i) => (
        <div
          key={i}
          className="flex-none w-px bg-emerald-300 rounded"
          style={{ height: `${15 + Math.abs(Math.sin(i * 0.8) * 20 + Math.cos(i * 0.3) * 15)}%` }}
        />
      ))}
    </div>
  )
}
