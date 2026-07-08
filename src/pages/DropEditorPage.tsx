import { useState, useEffect, useRef, useCallback } from 'react'
import { Music, Check, Play, Pause, Save, Zap } from 'lucide-react'
import { getSongLibrary, getPublicUrl } from '../lib/db'
import type { SongLibraryItem } from '../types'
import { setDropPoint, getAllDropPoints } from '../lib/dropStorage'

export function DropEditorPage() {
  const [songs, setSongs] = useState<SongLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [drops, setDrops] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<SongLibraryItem | null>(null)

  useEffect(() => {
    getSongLibrary().then(s => { setSongs(s); setLoading(false) }).catch(console.error)
    setDrops(getAllDropPoints())
  }, [])

  const handleSave = (songId: string, dropAt: number) => {
    setDropPoint(songId, dropAt)
    setDrops(prev => ({ ...prev, [songId]: dropAt }))
  }

  return (
    <div className="h-screen flex overflow-hidden bg-zinc-950">
      {/* Left: song list */}
      <div className="w-72 flex-none border-r border-zinc-800 flex flex-col">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className="text-violet-400" />
            <h2 className="font-semibold text-zinc-100 text-sm">Drop Editor</h2>
          </div>
          <p className="text-xs text-zinc-500">Marca el Drop de tus canciones</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {loading && <p className="text-xs text-zinc-600 text-center mt-6">Cargando...</p>}
          {songs.map(song => {
            const drop = drops[song.id]
            return (
              <button
                key={song.id}
                onClick={() => setSelected(song)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                  selected?.id === song.id
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <Music size={13} className="flex-none text-zinc-600" />
                <span className="flex-1 text-xs truncate">{song.name}</span>
                {drop !== undefined && (
                  <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 flex-none font-mono">
                    <Check size={9} />{drop.toFixed(1)}s
                  </span>
                )}
              </button>
            )
          })}
          {!loading && songs.length === 0 && (
            <p className="text-xs text-zinc-600 text-center mt-6 px-4">
              Sube canciones en la sección Canciones primero.
            </p>
          )}
        </div>
      </div>

      {/* Right: waveform editor */}
      <div className="flex-1 flex items-center justify-center">
        {selected ? (
          <WaveformEditor
            key={selected.id}
            song={selected}
            initialDrop={drops[selected.id] ?? null}
            onSave={dropAt => handleSave(selected.id, dropAt)}
          />
        ) : (
          <div className="text-center text-zinc-600">
            <Zap size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Selecciona una canción para editar su Drop</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Waveform Editor ───────────────────────────────────────────────────────────

function fmt(t: number) {
  const m = Math.floor(t / 60).toString().padStart(2, '0')
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function WaveformEditor({ song, initialDrop, onSave }: {
  song: SongLibraryItem
  initialDrop: number | null
  onSave: (dropAt: number) => void
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const audioRef    = useRef<HTMLAudioElement>(null)
  const peaksRef    = useRef<Float32Array | null>(null)
  const durationRef = useRef(song.duration ?? 0)

  const [playing,     setPlaying]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(song.duration ?? 0)
  const [dropAt,      setDropAt]      = useState<number>(initialDrop ?? 0)
  const [loadingWav,  setLoadingWav]  = useState(true)
  const [audioUrl,    setAudioUrl]    = useState<string | null>(null)
  const [saved,       setSaved]       = useState(false)

  const rafRef = useRef(0)
  const remoteUrl = getPublicUrl(song.storage_path)

  // ── Fetch once → blob URL (audio element) + decode (waveform) ─────────────
  useEffect(() => {
    let cancelled = false
    let blobUrl: string | null = null
    setLoadingWav(true)
    setAudioUrl(null)
    const W = 900

    fetch(remoteUrl)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return null
        blobUrl = URL.createObjectURL(blob)
        setAudioUrl(blobUrl)
        return blob.arrayBuffer()
      })
      .then(buf => {
        if (!buf || cancelled) return
        return new AudioContext().decodeAudioData(buf)
      })
      .then(decoded => {
        if (!decoded || cancelled) return
        const data = decoded.getChannelData(0)
        const blockSize = Math.max(1, Math.floor(data.length / W))
        const p = new Float32Array(W)
        for (let i = 0; i < W; i++) {
          let max = 0
          for (let j = 0; j < blockSize; j++) {
            const v = Math.abs(data[i * blockSize + j] || 0)
            if (v > max) max = v
          }
          p[i] = max
        }
        peaksRef.current = p
        durationRef.current = decoded.duration
        setDuration(decoded.duration)
        setLoadingWav(false)
      })
      .catch(() => setLoadingWav(false))

    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [remoteUrl])

  // ── Draw waveform ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const peaks  = peaksRef.current
    if (!canvas || !peaks) return
    const W = canvas.width
    const H = canvas.height
    const ctx = canvas.getContext('2d')!
    const dur = durationRef.current || 1

    ctx.fillStyle = '#18181b'
    ctx.fillRect(0, 0, W, H)

    const barW = W / peaks.length
    for (let i = 0; i < peaks.length; i++) {
      const t = (i / peaks.length) * dur
      const h = Math.max(2, peaks[i] * H * 0.88)
      const x = i * barW
      const nearDrop = Math.abs(t - dropAt) < 1.5
      ctx.fillStyle = nearDrop ? '#7c3aed' : '#3f3f46'
      ctx.fillRect(x, (H - h) / 2, Math.max(1, barW - 0.5), h)
    }

    // Playhead
    const phX = (currentTime / dur) * W
    ctx.fillStyle = '#a1a1aa80'
    ctx.fillRect(phX, 0, 1.5, H)

    // Drop marker
    const dropX = Math.round((dropAt / dur) * W)
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(dropX - 1, 0, 3, H)

    // Triangle at top of drop marker
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.moveTo(dropX - 7, 0)
    ctx.lineTo(dropX + 7, 0)
    ctx.lineTo(dropX, 10)
    ctx.fill()
  }, [dropAt, currentTime])

  useEffect(() => { draw() }, [draw, loadingWav])

  // ── RAF playback ───────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!playing) return
    const tick = () => {
      const aud = audioRef.current
      if (aud) setCurrentTime(aud.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  // ── Canvas interaction ─────────────────────────────────────────────────────
  const posToTime = (clientX: number, rect: DOMRect) => {
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    return (x / rect.width) * durationRef.current
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const t = posToTime(e.clientX, rect)
    setDropAt(t)
    // Seek audio
    if (audioRef.current) { audioRef.current.currentTime = t; setCurrentTime(t) }

    const onMove = (ev: MouseEvent) => {
      const t2 = posToTime(ev.clientX, rect)
      setDropAt(t2)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const togglePlay = async () => {
    const aud = audioRef.current
    if (!aud) return
    if (playing) {
      aud.pause()
      setPlaying(false)
    } else {
      try {
        await aud.play()
        setPlaying(true)
      } catch { /* autoplay denied or not loaded yet */ }
    }
  }

  const handleSave = () => {
    onSave(dropAt)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const dropPct = duration > 0 ? (dropAt / duration) * 100 : 0

  return (
    <div className="w-full max-w-3xl px-10 flex flex-col gap-8">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-zinc-100 truncate">{song.name}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">Haz clic en la onda para marcar el Drop · arrastra para ajustar</p>
      </div>

      {/* Showcase indicator + waveform */}
      <div className="flex flex-col gap-0">
        {/* Showcase pill — floats above marker */}
        <div className="relative h-8 pointer-events-none">
          <div
            className="absolute flex flex-col items-center"
            style={{ left: `${dropPct}%`, transform: 'translateX(-50%)', bottom: 0 }}
          >
            <div className="bg-violet-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-widest whitespace-nowrap shadow-lg">
              SHOWCASE
            </div>
          </div>
        </div>

        {/* Canvas */}
        {loadingWav ? (
          <div className="w-full h-32 bg-zinc-900 rounded-xl flex items-center justify-center">
            <p className="text-xs text-zinc-500 animate-pulse">Decodificando audio…</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={900}
            height={128}
            className="w-full rounded-xl cursor-crosshair select-none"
            onMouseDown={handleCanvasMouseDown}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          disabled={loadingWav}
          className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 flex items-center justify-center text-zinc-200 transition-colors cursor-pointer flex-none"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="text-xs font-mono text-zinc-500 tabular-nums">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <div className="flex items-center gap-3 ml-auto">
          <div className="text-right">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Drop</p>
            <p className="text-sm font-mono text-red-400 font-semibold">{fmt(dropAt)}</p>
          </div>
          <button
            onClick={handleSave}
            disabled={loadingWav}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-xl transition-all cursor-pointer disabled:opacity-40 ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-violet-600 hover:bg-violet-700 text-white'
            }`}
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? '¡Guardado!' : 'Guardar Drop'}
          </button>
        </div>
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={e => {
            const d = (e.target as HTMLAudioElement).duration
            durationRef.current = d
            setDuration(d)
          }}
        />
      )}
    </div>
  )
}
