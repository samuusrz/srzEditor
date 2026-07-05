import { useCallback, useState } from 'react'
import { ZoomIn, ZoomOut, Scissors, Volume2, VolumeX, Layers, Diamond, Trash2 } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem, VolumeKeyframe } from '../../types/editor'

const TRACK_H = 48
const RULER_H = 24
const LABEL_W = 72

const CLIP_COLORS = [
  'bg-violet-600', 'bg-blue-600', 'bg-teal-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600',
]

function fmtRuler(t: number) {
  if (t < 60) return `${t.toFixed(t % 1 === 0 ? 0 : 1)}s`
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(0).padStart(2, '0')}`
}

/** Linear interpolation between volume keyframes */
export function getVolumeAtTime(t: number, keyframes: VolumeKeyframe[], base: number): number {
  if (!keyframes.length) return base
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  if (t <= sorted[0].time) return sorted[0].volume
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].volume
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].time <= t && t <= sorted[i + 1].time) {
      const r = (t - sorted[i].time) / (sorted[i + 1].time - sorted[i].time)
      return sorted[i].volume + r * (sorted[i + 1].volume - sorted[i].volume)
    }
  }
  return base
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
  onMoveAudio: (patch: Partial<AudioTrack>) => void
  onDragAudioPos: (startAt: number) => void
  onDragAudioKf: (keyframes: VolumeKeyframe[]) => void
  onSelect: (item: SelectedItem) => void
  onSetZoom: (z: number) => void
  onSnapshot: () => void
}

export function Timeline({
  clips, texts, audio, playhead, totalDuration, zoom, selected,
  onSetPlayhead, onMoveClip, onTrimClip, onSplitClip, onToggleMute,
  onExtractAudio, onMoveText, onMoveAudio, onDragAudioPos, onDragAudioKf, onSelect, onSetZoom, onSnapshot,
}: Props) {
  const [snapLine, setSnapLine] = useState<number | null>(null)

  const visibleSecs = Math.max(totalDuration + 5, 15)
  const totalWidth  = visibleSecs * zoom

  const tickStep = zoom >= 150 ? 1 : zoom >= 70 ? 2 : 5
  const ticks: number[] = []
  for (let t = 0; t <= visibleSecs; t += tickStep) ticks.push(t)

  const selClipId = selected?.type === 'clip' ? selected.id : null
  const isAudioSel = selected?.type === 'audio'

  // ── Ruler seek ──────────────────────────────────────────────────────────
  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onSetPlayhead(Math.max(0, (e.clientX - rect.left) / zoom))
  }, [zoom, onSetPlayhead])

  // ── Generic drag factory ─────────────────────────────────────────────────
  function makeDrag(onMove: (ev: MouseEvent) => void, onEnd?: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      const move = (ev: MouseEvent) => onMove(ev)
      const up   = () => {
        onEnd?.()
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    }
  }

  // ── Clip body drag with snapping ─────────────────────────────────────────
  const startClipDrag = (e: React.MouseEvent, clip: Clip) => {
    onSelect({ type: 'clip', id: clip.id })
    const startX = e.clientX; const orig = clip.startAt
    makeDrag(ev => {
      const raw    = Math.max(0, orig + (ev.clientX - startX) / zoom)
      const thresh = 8 / zoom  // 8px snap radius

      // Snap points: timeline start + edges of every other clip
      const snapPts = [0, ...clips.filter(c => c.id !== clip.id).flatMap(c => [c.startAt, c.startAt + c.duration])]

      let snapped    = raw
      let snapTarget: number | null = null
      for (const sp of snapPts) {
        if (Math.abs(raw - sp) < thresh) {               // snap clip start
          snapped = sp; snapTarget = sp; break
        }
        if (Math.abs(raw + clip.duration - sp) < thresh) { // snap clip end
          snapped = sp - clip.duration; snapTarget = sp; break
        }
      }

      setSnapLine(snapTarget)
      onMoveClip(clip.id, Math.max(0, snapped))
    }, () => { setSnapLine(null); onSnapshot() })(e)
  }

  // ── Clip trim ────────────────────────────────────────────────────────────
  const startTrimDrag = (e: React.MouseEvent, clip: Clip, side: 'left' | 'right') => {
    const startX = e.clientX
    const { startAt, trimStart, duration, originalDuration } = clip
    makeDrag(ev => {
      const delta = (ev.clientX - startX) / zoom
      if (side === 'right') {
        onTrimClip(clip.id, trimStart, Math.max(0.1, Math.min(originalDuration - trimStart, duration + delta)), startAt)
      } else {
        const newTrim  = Math.max(0, Math.min(trimStart + duration - 0.1, trimStart + delta))
        const diff     = newTrim - trimStart
        onTrimClip(clip.id, newTrim, duration - diff, startAt + diff)
      }
    }, () => onSnapshot())(e)
  }

  // ── Text drag ────────────────────────────────────────────────────────────
  const startTextDrag = (e: React.MouseEvent, text: TextOverlay) => {
    onSelect({ type: 'text', id: text.id })
    const startX = e.clientX; const orig = text.startAt
    makeDrag(
      ev => onMoveText(text.id, Math.max(0, orig + (ev.clientX - startX) / zoom)),
      () => onSnapshot(),
    )(e)
  }

  // ── Audio drag ───────────────────────────────────────────────────────────
  const startAudioDrag = (e: React.MouseEvent) => {
    if (!audio) return
    onSelect({ type: 'audio' })
    const startX = e.clientX; const orig = audio.startAt
    makeDrag(
      ev => onDragAudioPos(Math.max(0, orig + (ev.clientX - startX) / zoom)),
      () => onSnapshot(),
    )(e)
  }

  // ── Volume keyframe drag ─────────────────────────────────────────────────
  const startKfDrag = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation()
    if (!audio) return
    const startY = e.clientY
    const origVol = audio.keyframes[idx].volume
    makeDrag(ev => {
      const dy     = (ev.clientY - startY) / TRACK_H
      const newVol = Math.max(0, Math.min(1, origVol - dy * 1.5))
      const newKfs = audio.keyframes.map((kf, i) => i === idx ? { ...kf, volume: newVol } : kf)
      onDragAudioKf(newKfs)
    }, () => onSnapshot())(e)
  }

  // ── Add volume keyframe at playhead ─────────────────────────────────────
  const handleAddKeyframe = () => {
    if (!audio) return
    const vol = getVolumeAtTime(playhead, audio.keyframes, audio.volume)
    const exists = audio.keyframes.some(k => Math.abs(k.time - playhead) < 0.05)
    if (exists) return
    const newKfs = [...audio.keyframes, { time: playhead, volume: vol }].sort((a, b) => a.time - b.time)
    onMoveAudio({ keyframes: newKfs })
    onSnapshot()
  }

  const deleteKeyframe = (idx: number) => {
    if (!audio) return
    onMoveAudio({ keyframes: audio.keyframes.filter((_, i) => i !== idx) })
    onSnapshot()
  }

  // ── Split ────────────────────────────────────────────────────────────────
  const handleSplit = () => {
    const id = selClipId ?? clips.find(c => c.startAt <= playhead && playhead < c.startAt + c.duration)?.id
    if (id) onSplitClip(id, playhead)
  }

  // ── Volume envelope points for SVG ──────────────────────────────────────
  const envelopePoints = (a: AudioTrack, w: number, h: number) => {
    const kfs = [...a.keyframes].sort((k, j) => k.time - j.time)
    const pts: [number, number][] = []
    if (!kfs.length) return [[0, h * (1 - a.volume)], [w, h * (1 - a.volume)]] as [number, number][]
    if (kfs[0].time > a.startAt) pts.push([0, h * (1 - a.volume)])
    kfs.forEach(k => pts.push([(k.time - a.startAt) * zoom, h * (1 - k.volume)]))
    const last = kfs[kfs.length - 1]
    if (last.time < a.startAt + a.duration) pts.push([w, h * (1 - a.volume)])
    return pts
  }

  return (
    <div className="h-[220px] flex-none bg-zinc-900 border-t border-zinc-800 flex flex-col select-none">
      {/* Controls */}
      <div className="h-9 flex items-center gap-1 px-3 border-b border-zinc-800 flex-none overflow-x-auto">
        <button onClick={() => onSetZoom(zoom - 20)} className="text-zinc-500 hover:text-zinc-200 cursor-pointer p-1"><ZoomOut size={13} /></button>
        <input type="range" min={40} max={400} step={10} value={zoom} onChange={e => onSetZoom(+e.target.value)} className="w-20 accent-violet-500" />
        <button onClick={() => onSetZoom(zoom + 20)} className="text-zinc-500 hover:text-zinc-200 cursor-pointer p-1"><ZoomIn size={13} /></button>
        <div className="w-px h-4 bg-zinc-700 mx-1 flex-none" />

        <CtrlBtn onClick={handleSplit} disabled={clips.length === 0} icon={<Scissors size={11} />} label="Cortar" />

        {selClipId && (() => {
          const clip = clips.find(c => c.id === selClipId)
          if (!clip) return null
          return <>
            <div className="w-px h-4 bg-zinc-700 mx-1 flex-none" />
            <CtrlBtn onClick={() => onToggleMute(selClipId)} icon={clip.muted ? <VolumeX size={11} /> : <Volume2 size={11} />} label={clip.muted ? 'Sin sonido' : 'Con sonido'} />
            <CtrlBtn onClick={() => onExtractAudio(selClipId)} icon={<Layers size={11} />} label="Extraer audio" />
          </>
        })()}

        {isAudioSel && <>
          <div className="w-px h-4 bg-zinc-700 mx-1 flex-none" />
          <CtrlBtn onClick={handleAddKeyframe} icon={<Diamond size={11} />} label="Keyframe en playhead" />
          {audio && audio.keyframes.length > 0 && (
            <CtrlBtn
              onClick={() => { onMoveAudio({ keyframes: [] }); onSnapshot() }}
              icon={<Trash2 size={11} />}
              label="Borrar keyframes"
              danger
            />
          )}
        </>}
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

        {/* Scrollable */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden relative">
          <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>

            {/* Ruler */}
            <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 cursor-pointer" style={{ height: RULER_H }} onClick={handleRulerClick}>
              {ticks.map(t => (
                <div key={t} className="absolute flex flex-col items-start" style={{ left: t * zoom }}>
                  <span className="text-[10px] text-zinc-500 ml-1 leading-none mt-0.5">{fmtRuler(t)}</span>
                  <div className="w-px h-2 bg-zinc-700 mt-0.5" />
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: playhead * zoom }}>
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-1 mt-4" />
              <div className="w-px h-full bg-red-500/80 -ml-px" />
            </div>

            {/* Snap guide */}
            {snapLine !== null && (
              <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: snapLine * zoom, width: 1, background: 'rgba(250,204,21,0.9)' }} />
            )}

            {/* ── Video track ── */}
            <div className="relative" style={{ height: TRACK_H }}>
              {clips.map((clip, i) => {
                const w = Math.max(4, clip.duration * zoom)
                return (
                  <div
                    key={clip.id}
                    className={`absolute top-1 bottom-1 rounded-md overflow-hidden border-2 transition-[border-color] ${CLIP_COLORS[i % CLIP_COLORS.length]} ${clip.id === selClipId ? 'border-white' : 'border-transparent'}`}
                    style={{ left: clip.startAt * zoom, width: w }}
                    onClick={() => onSelect({ type: 'clip', id: clip.id })}
                  >
                    {clip.thumbnail && <img src={clip.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-25" alt="" />}
                    <div className="absolute inset-x-3 inset-y-0 cursor-grab active:cursor-grabbing flex items-center gap-1" onMouseDown={e => startClipDrag(e, clip)}>
                      {clip.muted && <VolumeX size={9} className="text-white/60 flex-none" />}
                      <span className="text-[10px] text-white font-medium truncate flex-1">{clip.name}</span>
                      <span className="text-[10px] text-white/50 flex-none">{clip.duration.toFixed(1)}s</span>
                    </div>
                    <div className="absolute left-0 top-0 bottom-0 w-2.5 cursor-w-resize hover:bg-white/25 z-10" onMouseDown={e => startTrimDrag(e, clip, 'left')} />
                    <div className="absolute right-0 top-0 bottom-0 w-2.5 cursor-e-resize hover:bg-white/25 z-10" onMouseDown={e => startTrimDrag(e, clip, 'right')} />
                  </div>
                )
              })}
            </div>

            {/* ── Text track ── */}
            <div className="relative" style={{ height: TRACK_H }}>
              {texts.map(t => (
                <div
                  key={t.id}
                  className={`absolute top-1 bottom-1 rounded-md overflow-hidden border-2 bg-amber-500/30 cursor-grab active:cursor-grabbing ${selected?.type === 'text' && selected.id === t.id ? 'border-amber-400' : 'border-amber-600/50'}`}
                  style={{ left: t.startAt * zoom, width: Math.max(4, t.duration * zoom) }}
                  onMouseDown={e => startTextDrag(e, t)}
                  onClick={() => onSelect({ type: 'text', id: t.id })}
                >
                  <div className="absolute inset-x-1.5 inset-y-0 flex items-center gap-1">
                    <span className="text-[10px] text-amber-200 truncate flex-1">{t.content || 'Texto'}</span>
                    <span className="text-[10px] text-amber-200/50">{t.duration.toFixed(1)}s</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Audio track ── */}
            <div className="relative" style={{ height: TRACK_H }}>
              {audio && (() => {
                const w   = Math.max(4, audio.duration * zoom)
                const env = envelopePoints(audio, w, TRACK_H - 8)
                const pts = env.map(([x, y]) => `${x},${y}`).join(' ')
                const areaPath = `M${env[0][0]},${TRACK_H - 8} ${env.map(([x, y]) => `L${x},${y}`).join(' ')} L${env[env.length-1][0]},${TRACK_H - 8} Z`

                return (
                  <div
                    className={`absolute top-1 bottom-1 rounded-md overflow-hidden border-2 bg-emerald-600/30 cursor-grab active:cursor-grabbing ${isAudioSel ? 'border-emerald-400' : 'border-emerald-700/60'}`}
                    style={{ left: audio.startAt * zoom, width: w }}
                    onMouseDown={startAudioDrag}
                    onClick={() => onSelect({ type: 'audio' })}
                  >
                    {/* Waveform bg */}
                    <Waveform />

                    {/* Volume envelope */}
                    <svg
                      className="absolute inset-0"
                      style={{ width: w, height: TRACK_H - 8, top: 4, pointerEvents: 'none' }}
                      viewBox={`0 0 ${w} ${TRACK_H - 8}`}
                      preserveAspectRatio="none"
                    >
                      <path d={areaPath} fill="rgba(52,211,153,0.18)" />
                      <polyline points={pts} fill="none" stroke="rgba(52,211,153,0.85)" strokeWidth="1.5" />
                    </svg>

                    {/* Keyframe diamonds */}
                    {audio.keyframes.map((kf, i) => {
                      const kx = (kf.time - audio.startAt) * zoom
                      const ky = 4 + (TRACK_H - 8) * (1 - kf.volume)
                      return (
                        <div
                          key={i}
                          className="absolute z-20 cursor-ns-resize"
                          style={{ left: kx - 5, top: ky - 5, width: 10, height: 10, pointerEvents: 'auto' }}
                          onMouseDown={e => startKfDrag(e, i)}
                          onDoubleClick={e => { e.stopPropagation(); deleteKeyframe(i) }}
                          title={`${Math.round(kf.volume * 100)}% — doble clic para borrar`}
                        >
                          <div
                            className="w-full h-full bg-emerald-300 border border-emerald-700"
                            style={{ transform: 'rotate(45deg) scale(0.7)', borderRadius: 1 }}
                          />
                        </div>
                      )
                    })}

                    {/* Label */}
                    <div className="absolute inset-x-1.5 bottom-1 flex items-end gap-1 z-10">
                      <span className="text-[10px] text-emerald-200 truncate flex-1">{audio.name}</span>
                      <span className="text-[10px] text-emerald-200/50">{audio.duration.toFixed(1)}s</span>
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
  return <div className="flex items-center px-2 text-[11px] text-zinc-500" style={{ height: TRACK_H }}>{children}</div>
}

function CtrlBtn({ onClick, icon, label, disabled, danger }: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors cursor-pointer disabled:opacity-30 flex-none
        ${danger ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'}`}
    >
      {icon}{label}
    </button>
  )
}

function Waveform() {
  return (
    <div className="absolute inset-0 flex items-center gap-px px-1 opacity-20 overflow-hidden">
      {Array.from({ length: 100 }).map((_, i) => (
        <div key={i} className="flex-none w-px bg-emerald-300 rounded"
          style={{ height: `${15 + Math.abs(Math.sin(i * 0.8) * 20 + Math.cos(i * 0.3) * 15)}%` }} />
      ))}
    </div>
  )
}
