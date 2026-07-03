import { useRef, useCallback } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem } from '../../types/editor'

const TRACK_H  = 48
const RULER_H  = 24
const LABEL_W  = 64
const MIN_TOTAL = 10   // minimum visible seconds

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  playhead: number
  playing: boolean
  totalDuration: number
  zoom: number
  selected: SelectedItem
  onSetPlayhead: (t: number) => void
  onSetPlaying: (p: boolean) => void
  onMoveClip: (id: string, startAt: number) => void
  onPackClips: (order: string[]) => void
  onSelect: (item: SelectedItem) => void
  onSetZoom: (z: number) => void
}

function fmt(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  return m > 0 ? `${m}:${s}` : `${s}s`
}

// Colour palette for clips
const CLIP_COLORS = [
  'bg-violet-600', 'bg-blue-600', 'bg-teal-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600',
]

export function Timeline({
  clips, texts, audio, playhead, totalDuration, zoom, selected,
  onSetPlayhead, onMoveClip, onPackClips, onSelect, onSetZoom,
}: Props) {
  const scrollRef    = useRef<HTMLDivElement>(null)
  const visibleSecs  = Math.max(totalDuration + 4, MIN_TOTAL)
  const totalWidth   = visibleSecs * zoom

  // ── Ruler click → seek ────────────────────────────────────────────────────
  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x    = e.clientX - rect.left
    onSetPlayhead(Math.max(0, x / zoom))
  }, [zoom, onSetPlayhead])

  // ── Clip drag ─────────────────────────────────────────────────────────────
  const startClipDrag = useCallback((e: React.MouseEvent, clip: Clip) => {
    e.stopPropagation()
    onSelect({ type: 'clip', id: clip.id })

    const startX     = e.clientX
    const origStart  = clip.startAt

    const onMove = (ev: MouseEvent) => {
      const delta    = (ev.clientX - startX) / zoom
      onMoveClip(clip.id, Math.max(0, origStart + delta))
    }
    const onUp = () => {
      // Sort by current startAt, then re-pack sequentially
      const sorted = [...clips].sort((a, b) => a.startAt - b.startAt)
      onPackClips(sorted.map(c => c.id))
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [clips, zoom, onMoveClip, onPackClips, onSelect])

  // ── Ruler tick marks ─────────────────────────────────────────────────────
  const tickStep = zoom >= 150 ? 1 : zoom >= 60 ? 2 : 5
  const ticks: number[] = []
  for (let t = 0; t <= visibleSecs; t += tickStep) ticks.push(t)

  const isClipSel  = (id: string) => selected?.type === 'clip' && selected.id === id
  const isTextSel  = (id: string) => selected?.type === 'text' && selected.id === id
  const isAudioSel = selected?.type === 'audio'

  return (
    <div className="h-[200px] flex-none bg-zinc-900 border-t border-zinc-800 flex flex-col select-none">
      {/* Controls */}
      <div className="h-8 flex items-center gap-2 px-4 border-b border-zinc-800 flex-none">
        <button onClick={() => onSetZoom(zoom - 20)} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
          <ZoomOut size={14} />
        </button>
        <input
          type="range" min={40} max={400} step={10} value={zoom}
          onChange={e => onSetZoom(+e.target.value)}
          className="w-24 accent-violet-500"
        />
        <button onClick={() => onSetZoom(zoom + 20)} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
          <ZoomIn size={14} />
        </button>
        <span className="text-xs text-zinc-600 font-mono">{zoom}px/s</span>
      </div>

      {/* Tracks area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed labels */}
        <div className="flex-none border-r border-zinc-800" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} />
          <TrackLabel>Vídeo</TrackLabel>
          <TrackLabel>Texto</TrackLabel>
          <TrackLabel>Audio</TrackLabel>
        </div>

        {/* Scrollable tracks */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative">
          <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>
            {/* Ruler */}
            <div
              className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 cursor-pointer"
              style={{ height: RULER_H }}
              onClick={handleRulerClick}
            >
              {ticks.map(t => (
                <div key={t} className="absolute flex flex-col items-center" style={{ left: t * zoom }}>
                  <span className="text-[10px] text-zinc-500 leading-none mt-0.5 ml-1">{fmt(t)}</span>
                  <div className="w-px h-2 bg-zinc-700 mt-0.5" />
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none"
              style={{ left: playhead * zoom, width: 1 }}
            >
              <div className="w-2 h-2 bg-red-500 rounded-full -ml-0.5 mt-5" />
              <div className="w-px h-full bg-red-500 opacity-80" />
            </div>

            {/* Video track */}
            <div className="relative" style={{ height: TRACK_H }}>
              {clips.map((clip, i) => (
                <div
                  key={clip.id}
                  onMouseDown={e => startClipDrag(e, clip)}
                  onClick={() => onSelect({ type: 'clip', id: clip.id })}
                  className={`
                    absolute top-1 bottom-1 rounded-md cursor-grab active:cursor-grabbing overflow-hidden
                    border-2 transition-[border-color]
                    ${CLIP_COLORS[i % CLIP_COLORS.length]}
                    ${isClipSel(clip.id) ? 'border-white' : 'border-transparent'}
                  `}
                  style={{ left: clip.startAt * zoom, width: Math.max(4, clip.duration * zoom) }}
                >
                  {clip.thumbnail && (
                    <img src={clip.thumbnail} className="h-full object-cover opacity-40" alt="" />
                  )}
                  <div className="absolute inset-0 flex items-center px-1.5">
                    <span className="text-[10px] text-white font-medium truncate drop-shadow">{clip.name}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Text track */}
            <div className="relative" style={{ height: TRACK_H }}>
              {texts.map(t => (
                <div
                  key={t.id}
                  onClick={() => onSelect({ type: 'text', id: t.id })}
                  className={`
                    absolute top-1 bottom-1 rounded-md cursor-pointer overflow-hidden
                    bg-amber-500/30 border-2 transition-[border-color]
                    ${isTextSel(t.id) ? 'border-amber-400' : 'border-amber-600/50'}
                  `}
                  style={{ left: t.startAt * zoom, width: Math.max(4, t.duration * zoom) }}
                >
                  <span className="absolute inset-x-1.5 top-1/2 -translate-y-1/2 text-[10px] text-amber-200 truncate">{t.content}</span>
                </div>
              ))}
            </div>

            {/* Audio track */}
            <div className="relative" style={{ height: TRACK_H }}>
              {audio && (
                <div
                  onClick={() => onSelect({ type: 'audio' })}
                  className={`
                    absolute top-1 bottom-1 rounded-md cursor-pointer overflow-hidden
                    bg-emerald-600/40 border-2 transition-[border-color]
                    ${isAudioSel ? 'border-emerald-400' : 'border-emerald-700/60'}
                  `}
                  style={{ left: audio.startAt * zoom, width: Math.max(4, audio.duration * zoom) }}
                >
                  <AudioWaveform />
                  <span className="absolute inset-x-1.5 top-1/2 -translate-y-1/2 text-[10px] text-emerald-200 truncate z-10">{audio.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center px-2 text-[11px] text-zinc-500"
      style={{ height: TRACK_H }}
    >
      {children}
    </div>
  )
}

function AudioWaveform() {
  return (
    <div className="absolute inset-0 flex items-center gap-px px-1 opacity-40 overflow-hidden">
      {Array.from({ length: 80 }).map((_, i) => (
        <div
          key={i}
          className="flex-none w-px bg-emerald-300 rounded"
          style={{ height: `${20 + Math.sin(i * 0.7) * 15 + Math.random() * 10}%` }}
        />
      ))}
    </div>
  )
}
