import { useRef, useState, useEffect } from 'react'
import { Plus, Film, Type, Music, Trash2, Upload, Library, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2, Check, Play, Square } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack } from '../../types/editor'
import {
  getSongLibrary, createSongItem, deleteSongItem, getPublicUrl,
  getTextLibrary, createTextItem, deleteTextItem,
} from '../../lib/db'
import type { SongLibraryItem, TextLibraryItem } from '../../types'
import { getDropPoint } from '../../lib/dropStorage'
import { getAllSongCovers } from '../../lib/songCovers'
import { getSongFolders, type SongFolder } from '../../lib/songFolders'
import { getUsageTimes, recordUsage } from '../../lib/usageTracker'

const SONG_USAGE_KEY = 'srz-song-usage'
const TEXT_USAGE_KEY = 'srz-text-usage'

// ── helpers ───────────────────────────────────────────────────────────────────

async function getVideoMeta(file: File): Promise<{ duration: number; thumbnail: string; localUrl: string }> {
  const localUrl = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const vid = document.createElement('video')
    vid.src = localUrl; vid.preload = 'metadata'; vid.currentTime = 0.1
    vid.onloadeddata = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 120; canvas.height = 214
      canvas.getContext('2d')!.drawImage(vid, 0, 0, 120, 214)
      resolve({ duration: vid.duration, thumbnail: canvas.toDataURL('image/jpeg', 0.7), localUrl })
    }
    vid.onerror = () => resolve({ duration: 0, thumbnail: '', localUrl })
  })
}

async function getAudioDuration(file: File): Promise<{ duration: number; localUrl: string }> {
  const localUrl = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    a.src = localUrl
    a.onloadedmetadata = () => resolve({ duration: a.duration, localUrl })
    a.onerror = () => resolve({ duration: 0, localUrl })
  })
}

async function fetchAudioFile(url: string, name: string): Promise<{ file: File; duration: number; localUrl: string }> {
  const res  = await fetch(url)
  const blob = await res.blob()
  const file = new File([blob], name, { type: blob.type || 'audio/mpeg' })
  return getAudioDuration(file).then(({ duration, localUrl }) => ({ file, duration, localUrl }))
}

// ── text template helpers ─────────────────────────────────────────────────────

interface TextTemplate {
  id: string
  name: string
  content: string
  x: number
  y: number
  fontSize: number
  color: string
  bold: boolean
}

function parseTemplate(item: TextLibraryItem): TextTemplate | null {
  try {
    const p = JSON.parse(item.content)
    if (p.__t === 1) return { id: item.id, name: p.name, content: p.content, x: p.x, y: p.y, fontSize: p.fontSize, color: p.color, bold: p.bold }
  } catch {}
  return null
}

function encodeTemplate(name: string, t: TextOverlay): string {
  return JSON.stringify({ __t: 1, name, content: t.content, x: t.x, y: t.y, fontSize: t.fontSize, color: t.color, bold: t.bold })
}

// ── types ─────────────────────────────────────────────────────────────────────

type Tab    = 'media' | 'text' | 'audio'
type SubTab = 'library' | 'local'

interface Props {
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  totalDuration: number
  onAddClip: (clip: Clip) => void
  onRemoveClip: (id: string) => void
  onAddText: (text: TextOverlay) => void
  onRemoveText: (id: string) => void
  onSetAudio: (audio: AudioTrack) => void
  onRemoveAudio: () => void
  onPreviewClip: (clip: Clip) => void
}

// ── component ─────────────────────────────────────────────────────────────────

export function MediaPanel({
  clips, texts, audio, totalDuration,
  onAddClip, onRemoveClip, onAddText, onRemoveText, onSetAudio, onRemoveAudio, onPreviewClip,
}: Props) {
  const [tab,    setTab]    = useState<Tab>('media')
  const [subTab, setSubTab] = useState<SubTab>('library')
  const [dragging, setDragging] = useState(false)

  const clipInputRef  = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const songInputRef  = useRef<HTMLInputElement>(null)

  const importClips = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/')) continue
      const { duration, thumbnail, localUrl } = await getVideoMeta(file)
      onAddClip({
        id: crypto.randomUUID(), file, localUrl,
        name: file.name.replace(/\.[^.]+$/, ''), thumbnail,
        startAt: 0, duration, originalDuration: duration,
        trimStart: 0, volume: 1, muted: false, track: 0,
      })
    }
  }

  const importLocalAudio = async (files: FileList | null) => {
    if (!files || !files[0]) return
    const file = files[0]
    const { duration, localUrl } = await getAudioDuration(file)
    onSetAudio({
      id: crypto.randomUUID(), file, localUrl,
      name: file.name.replace(/\.[^.]+$/, ''),
      startAt: 0, trimStart: 0, duration, originalDuration: duration, volume: 1, fadeIn: 0, fadeOut: 0, keyframes: [],
    })
  }

  const tabs = [
    { id: 'media' as Tab, label: 'Media', icon: <Film size={14} /> },
    { id: 'text'  as Tab, label: 'Texto', icon: <Type size={14} /> },
    { id: 'audio' as Tab, label: 'Audio', icon: <Music size={14} /> },
  ]

  return (
    <div className="w-72 flex-none bg-zinc-950 border-r border-zinc-800 flex flex-col">
      {/* Main tabs */}
      <div className="flex border-b border-zinc-800">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors cursor-pointer ${
              tab === t.id ? 'text-violet-400 border-b-2 border-violet-500' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Media ── */}
      {tab === 'media' && (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          <input ref={clipInputRef} type="file" accept="video/*" multiple className="hidden" onChange={e => importClips(e.target.files)} />
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); importClips(e.dataTransfer.files) }}
            onClick={() => clipInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors ${dragging ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
          >
            <Upload size={20} className="text-zinc-500" />
            <p className="text-xs text-zinc-500 text-center">Arrastra vídeos o haz clic</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {clips.map(clip => (
              <div key={clip.id} className="group relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
                {clip.thumbnail
                  ? <img src={clip.thumbnail} className="w-full aspect-[9/16] object-cover" alt="" />
                  : <div className="w-full aspect-[9/16] bg-zinc-800 flex items-center justify-center"><Film size={16} className="text-zinc-600" /></div>
                }
                <div className="px-1.5 py-1 flex flex-col">
                  <p className="text-[10px] text-zinc-300 truncate">{clip.name}</p>
                  <span className="text-[9px] text-zinc-500">{clip.duration.toFixed(1)}s</span>
                </div>
                <button onClick={() => onRemoveClip(clip.id)}
                  className="absolute top-1 right-1 p-0.5 bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-400 cursor-pointer">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
          {clips.length === 0 && <p className="text-xs text-zinc-600 text-center mt-2">Sin clips importados</p>}
        </div>
      )}

      {/* ── Text ── */}
      {tab === 'text' && (
        <div className="flex-1 flex flex-col min-h-0">
          <SubTabBar value={subTab} onChange={setSubTab} />
          {subTab === 'library'
            ? <TextLibraryPane texts={texts} totalDuration={totalDuration} onAddText={onAddText} onRemoveText={onRemoveText} />
            : <TextLocalPane texts={texts} totalDuration={totalDuration} onAddText={onAddText} />
          }
        </div>
      )}

      {/* ── Audio ── */}
      {tab === 'audio' && (
        <div className="flex-1 flex flex-col min-h-0">
          <SubTabBar value={subTab} onChange={setSubTab} />
          {subTab === 'library'
            ? <AudioLibraryPane onSetAudio={onSetAudio} clips={clips} onPreviewClip={onPreviewClip} />
            : <AudioLocalPane audio={audio} audioInputRef={audioInputRef} songInputRef={songInputRef} onImport={importLocalAudio} onRemove={onRemoveAudio} />
          }
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={e => importLocalAudio(e.target.files)} />
        </div>
      )}
    </div>
  )
}

// ── SubTabBar ─────────────────────────────────────────────────────────────────

function SubTabBar({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div className="flex border-b border-zinc-800 flex-none">
      {([['library', <Library size={11} />, 'Biblioteca'], ['local', <Plus size={11} />, 'Local']] as const).map(([id, icon, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] transition-colors cursor-pointer ${
            value === id ? 'text-violet-400 border-b-2 border-violet-500' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {icon}{label}
        </button>
      ))}
    </div>
  )
}

// ── Text Library Pane ─────────────────────────────────────────────────────────

function TextLibraryPane({ texts, totalDuration, onAddText, onRemoveText }: {
  texts: TextOverlay[]
  totalDuration: number
  onAddText: (t: TextOverlay) => void
  onRemoveText: (id: string) => void
}) {
  const [templates, setTemplates] = useState<TextTemplate[]>([])
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [moleName, setMoleName]   = useState('')
  const [textUsage, setTextUsage] = useState<Record<string, number>>(() => getUsageTimes(TEXT_USAGE_KEY))

  const loadTemplates = () => {
    setLoading(true)
    getTextLibrary()
      .then(items => setTemplates(items.map(parseTemplate).filter(Boolean) as TextTemplate[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTemplates() }, [])

  const handleAddText = () => {
    const id = crypto.randomUUID()
    onAddText({
      id, content: 'Texto',
      startAt: 0, duration: Math.max(3, totalDuration),
      x: 50, y: 15, fontSize: 72, color: '#ffffff', bold: true, track: 0,
    })
    setPendingId(id)
    setMoleName('')
  }

  const handleSave = async () => {
    if (!pendingId || !moleName.trim()) return
    const text = texts.find(t => t.id === pendingId)
    if (!text) { setPendingId(null); return }
    setSaving(true)
    try {
      await createTextItem(encodeTemplate(moleName.trim(), text))
      onRemoveText(pendingId)
      setPendingId(null)
      setMoleName('')
      loadTemplates()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleDiscard = () => {
    if (pendingId) onRemoveText(pendingId)
    setPendingId(null)
    setMoleName('')
  }

  const useTemplate = (tmpl: TextTemplate) => {
    recordUsage(TEXT_USAGE_KEY, tmpl.id)
    setTextUsage(getUsageTimes(TEXT_USAGE_KEY))
    onAddText({
      id: crypto.randomUUID(),
      content: tmpl.content,
      x: tmpl.x, y: tmpl.y,
      fontSize: tmpl.fontSize,
      color: tmpl.color,
      bold: tmpl.bold,
      startAt: 0,
      duration: Math.max(3, totalDuration),
      track: 0,
    })
  }

  const sortedTemplates = [...templates].sort((a, b) => (textUsage[b.id] ?? 0) - (textUsage[a.id] ?? 0))

  const removeTemplate = async (tmpl: TextTemplate) => {
    await deleteTextItem(tmpl.id).catch(console.error)
    setTemplates(prev => prev.filter(t => t.id !== tmpl.id))
  }

  // Template editing mode
  if (pendingId) {
    const currentText = texts.find(t => t.id === pendingId)
    return (
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div className="bg-violet-900/20 border border-violet-700/40 rounded-xl p-3">
          <p className="text-xs font-semibold text-violet-300 mb-1">Editando molde</p>
          <p className="text-[10px] text-zinc-400 leading-relaxed">Edita el texto en el previsualizador — posición, tamaño, color y contenido. Cuando esté listo, ponle un nombre y guárdalo.</p>
        </div>

        {currentText && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-[10px] text-zinc-500 space-y-0.5">
            <div className="flex justify-between"><span>Contenido</span><span className="text-zinc-300 truncate max-w-[120px]">{currentText.content}</span></div>
            <div className="flex justify-between"><span>Posición</span><span className="text-zinc-300">{currentText.x.toFixed(0)}% · {currentText.y.toFixed(0)}%</span></div>
            <div className="flex justify-between"><span>Tamaño</span><span className="text-zinc-300">{currentText.fontSize}px</span></div>
            <div className="flex justify-between"><span>Color</span><span className="text-zinc-300 flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: currentText.color }} />{currentText.color}</span></div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Nombre del molde</label>
          <input
            value={moleName} onChange={e => setMoleName(e.target.value)}
            placeholder="ej: Título grande blanco..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-violet-500"
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !moleName.trim()}
          className="w-full flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-medium rounded-xl py-2 cursor-pointer transition-colors"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Guardar en biblioteca
        </button>
        <button
          onClick={handleDiscard}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1 cursor-pointer transition-colors"
        >
          Descartar
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
      <button
        onClick={handleAddText}
        className="w-full flex items-center gap-2 justify-center bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors cursor-pointer"
      >
        <Plus size={14} />Añadir texto
      </button>

      {loading && <p className="text-xs text-zinc-600 text-center mt-2">Cargando...</p>}

      {templates.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-1">Moldes guardados</p>
          {sortedTemplates.map(tmpl => (
            <div key={tmpl.id} className="group flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-2 py-2 transition-colors">
              {/* Color swatch */}
              <div className="w-5 h-5 rounded flex-none flex items-center justify-center" style={{ background: tmpl.color + '22', border: `1.5px solid ${tmpl.color}44` }}>
                <Type size={10} style={{ color: tmpl.color }} />
              </div>
              <button
                onClick={() => useTemplate(tmpl)}
                className="flex-1 text-left min-w-0 cursor-pointer"
              >
                <p className="text-xs text-zinc-200 truncate">{tmpl.name}</p>
                <p className="text-[9px] text-zinc-500 truncate">{tmpl.content} · {tmpl.fontSize}px</p>
              </button>
              <button onClick={() => removeTemplate(tmpl)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all cursor-pointer flex-none">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && templates.length === 0 && (
        <p className="text-xs text-zinc-600 text-center mt-2 px-2">Crea un texto, edítalo como quieras y guárdalo como molde.</p>
      )}
    </div>
  )
}

// ── Text Local Pane ───────────────────────────────────────────────────────────

function TextLocalPane({ texts, totalDuration, onAddText }: {
  texts: TextOverlay[]
  totalDuration: number
  onAddText: (t: TextOverlay) => void
}) {
  const addText = () => {
    onAddText({
      id: crypto.randomUUID(), content: 'Texto',
      startAt: 0, duration: Math.max(3, totalDuration),
      x: 50, y: 15, fontSize: 72, color: '#ffffff', bold: true, track: 0,
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
      <button onClick={addText}
        className="w-full flex items-center gap-2 justify-center bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors cursor-pointer">
        <Plus size={14} />Añadir texto
      </button>
      {texts.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">En el proyecto</p>
          {texts.map(t => (
            <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 truncate">
              {t.content || '(vacío)'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Audio Library Pane ────────────────────────────────────────────────────────

interface PendingDropSong {
  song: SongLibraryItem
  dropAt: number
  url: string
  file: File
  duration: number
  localUrl: string
}

function AudioLibraryPane({ onSetAudio, clips, onPreviewClip }: {
  onSetAudio: (a: AudioTrack) => void
  clips: Clip[]
  onPreviewClip: (clip: Clip) => void
}) {
  const [songs, setSongs]         = useState<SongLibraryItem[]>([])
  const [loading, setLoading]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newName, setNewName]     = useState('')
  const fileRef                   = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile]       = useState<File | null>(null)
  const [pendingDropSong, setPendingDropSong] = useState<PendingDropSong | null>(null)
  const [selectedClip, setSelectedClip]     = useState<Clip | null>(null)
  const [covers, setCovers]                 = useState<Record<string, string>>({})
  const [folders, setFolders]               = useState<SongFolder[]>([])
  const [collapsed, setCollapsed]           = useState<Record<string, boolean>>({})
  const [songUsage, setSongUsage]           = useState<Record<string, number>>({})
  const [previewingId, setPreviewingId]     = useState<string | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewBlobUrl  = useRef<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getSongLibrary().then(setSongs).catch(console.error).finally(() => setLoading(false))
    setCovers(getAllSongCovers())
    setFolders(getSongFolders())
    setSongUsage(getUsageTimes(SONG_USAGE_KEY))
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setNewName(file.name.replace(/\.[^.]+$/, ''))
    e.target.value = ''
  }

  const uploadSong = async () => {
    if (!pendingFile || !newName.trim()) return
    setUploading(true)
    try {
      const song = await createSongItem(newName.trim(), pendingFile)
      setSongs(prev => [song, ...prev])
      setPendingFile(null); setNewName('')
    } catch (e) { console.error(e) }
    setUploading(false)
  }

  const removeSong = async (song: SongLibraryItem) => {
    await deleteSongItem(song.id, song.storage_path).catch(console.error)
    setSongs(prev => prev.filter(s => s.id !== song.id))
  }

  const useSong = async (song: SongLibraryItem) => {
    const url = getPublicUrl(song.storage_path)
    try {
      const { file, duration, localUrl } = await fetchAudioFile(url, song.name)
      const finalDuration = song.duration ?? duration
      const dropAt = getDropPoint(song.id)
      recordUsage(SONG_USAGE_KEY, song.id)
      setSongUsage(getUsageTimes(SONG_USAGE_KEY))
      if (dropAt !== null && clips.length > 0) {
        setSelectedClip(null)
        setPendingDropSong({ song, dropAt, url, file, duration: finalDuration, localUrl })
      } else {
        onSetAudio({
          id: crypto.randomUUID(), file, localUrl, name: song.name,
          startAt: 0, trimStart: 0, duration: finalDuration, originalDuration: finalDuration,
          volume: 1, fadeIn: 0, fadeOut: 0, keyframes: [],
        })
      }
    } catch (e) { console.error(e) }
  }

  const stopPreview = () => {
    previewAudioRef.current?.pause()
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    if (previewBlobUrl.current) { URL.revokeObjectURL(previewBlobUrl.current); previewBlobUrl.current = null }
    setPreviewingId(null)
    setPreviewLoadingId(null)
  }

  const togglePreview = async (song: SongLibraryItem) => {
    if (previewingId === song.id || previewLoadingId === song.id) { stopPreview(); return }
    stopPreview()
    setPreviewLoadingId(song.id)

    try {
      const url = getPublicUrl(song.storage_path)
      const blob = await fetch(url).then(r => r.blob())
      const blobUrl = URL.createObjectURL(blob)
      previewBlobUrl.current = blobUrl

      const dropAt = getDropPoint(song.id)
      const ZONE  = 1.5
      const from  = dropAt !== null ? Math.max(0, dropAt - ZONE) : 0
      const until = dropAt !== null ? dropAt + ZONE : 5

      const audio = new Audio(blobUrl)
      previewAudioRef.current = audio
      audio.onended = stopPreview

      audio.addEventListener('loadedmetadata', () => {
        audio.currentTime = from
        audio.play().catch(stopPreview)
        previewTimerRef.current = setTimeout(stopPreview, (until - from) * 1000)
      }, { once: true })

      setPreviewLoadingId(null)
      setPreviewingId(song.id)
    } catch {
      stopPreview()
    }
  }

  const applyWithClip = (clip: Clip) => {
    if (!pendingDropSong) return
    const { dropAt, file, localUrl, duration, song } = pendingDropSong
    const trimStart = Math.max(0, dropAt - clip.startAt)
    const audioStartAt = Math.max(0, clip.startAt - dropAt)
    onSetAudio({
      id: crypto.randomUUID(), file, localUrl, name: song.name,
      startAt: audioStartAt, trimStart,
      duration: Math.max(0.1, duration - trimStart),
      originalDuration: duration,
      volume: 1, fadeIn: 0, fadeOut: 0, keyframes: [],
    })
    setPendingDropSong(null); setSelectedClip(null)
  }

  const applyWithoutSync = () => {
    if (!pendingDropSong) return
    const { file, localUrl, duration, song } = pendingDropSong
    onSetAudio({
      id: crypto.randomUUID(), file, localUrl, name: song.name,
      startAt: 0, trimStart: 0, duration, originalDuration: duration,
      volume: 1, fadeIn: 0, fadeOut: 0, keyframes: [],
    })
    setPendingDropSong(null); setSelectedClip(null)
  }

  const handleSelectClip = (clip: Clip) => {
    setSelectedClip(clip); onPreviewClip(clip)
  }

  const toggleSection = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const sortedClips = [...clips].sort((a, b) => a.startAt - b.startAt)

  // Sort songs by most recently used, then by created_at (newest first for unused)
  const sortedSongs = [...songs].sort((a, b) => {
    const ua = songUsage[a.id] ?? 0
    const ub = songUsage[b.id] ?? 0
    return ub - ua
  })

  // Group songs by folder
  const assignedIds = new Set(folders.flatMap(f => f.songIds))
  const unassigned  = sortedSongs.filter(s => !assignedIds.has(s.id))

  const SongItem = ({ song }: { song: SongLibraryItem }) => {
    const isPreviewing = previewingId === song.id
    const isLoading    = previewLoadingId === song.id
    const isActive     = isPreviewing || isLoading
    return (
      <div className="group flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5">
        <div className="w-8 h-8 rounded-md overflow-hidden bg-zinc-800 flex items-center justify-center flex-none">
          {covers[song.id]
            ? <img src={covers[song.id]} className="w-full h-full object-cover" alt="" />
            : <Music size={12} className="text-zinc-600" />
          }
        </div>
        <button onClick={() => useSong(song)} className="flex-1 text-left cursor-pointer hover:text-white transition-colors min-w-0">
          <p className="text-xs text-zinc-300 truncate">{song.name}</p>
          {song.duration && <p className="text-[10px] text-zinc-500">{song.duration.toFixed(1)}s</p>}
        </button>
        <button
          onClick={e => { e.stopPropagation(); togglePreview(song) }}
          title={isPreviewing ? 'Parar' : 'Escuchar drop'}
          className={`w-6 h-6 rounded-md flex items-center justify-center flex-none cursor-pointer transition-colors ${
            isActive
              ? 'bg-violet-600 text-white'
              : 'text-zinc-600 hover:text-violet-400 hover:bg-zinc-800 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isLoading
            ? <Loader2 size={9} className="animate-spin" />
            : isPreviewing
              ? <Square size={9} className="fill-white" />
              : <Play size={9} className="fill-current" />
          }
        </button>
        <button onClick={() => removeSong(song)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all cursor-pointer flex-none">
          <Trash2 size={10} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 relative">
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />

      {pendingFile ? (
        <div className="flex flex-col gap-1">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre de la canción"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-violet-500" />
          <div className="flex gap-1">
            <button onClick={uploadSong} disabled={uploading || !newName.trim()}
              className="flex-1 flex items-center justify-center gap-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg py-1.5 text-xs cursor-pointer transition-colors">
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}Subir
            </button>
            <button onClick={() => { setPendingFile(null); setNewName('') }} className="px-2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()}
          className="w-full flex items-center gap-2 justify-center border-2 border-dashed border-zinc-700 hover:border-violet-600 rounded-xl py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
          <Upload size={13} />Subir a biblioteca
        </button>
      )}

      {loading && <p className="text-xs text-zinc-600 text-center">Cargando...</p>}

      {/* Folders */}
      {folders.map(folder => {
        const folderSongs = sortedSongs.filter(s => folder.songIds.includes(s.id))
        if (folderSongs.length === 0) return null
        const isCollapsed = collapsed[folder.id]
        return (
          <div key={folder.id}>
            <button
              onClick={() => toggleSection(folder.id)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer mb-1 w-full text-left"
            >
              {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              {isCollapsed ? <Folder size={11} className="text-amber-400" /> : <FolderOpen size={11} className="text-amber-400" />}
              {folder.name}
              <span className="text-zinc-700 ml-0.5">({folderSongs.length})</span>
            </button>
            {!isCollapsed && (
              <div className="flex flex-col gap-1 pl-3 border-l border-zinc-800">
                {folderSongs.map(song => <SongItem key={song.id} song={song} />)}
              </div>
            )}
          </div>
        )
      })}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div className="flex flex-col gap-1">
          {folders.some(f => songs.some(s => f.songIds.includes(s.id))) && (
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Sin carpeta</p>
          )}
          {unassigned.map(song => <SongItem key={song.id} song={song} />)}
        </div>
      )}

      {!loading && songs.length === 0 && <p className="text-xs text-zinc-600 text-center mt-2">Biblioteca vacía</p>}

      {/* Drop sync modal */}
      {pendingDropSong && (
        <div className="absolute inset-0 bg-zinc-950 z-10 flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b border-zinc-800 flex-none">
            <p className="text-xs font-semibold text-zinc-100">¿Cuál es el clip showcase?</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">El Drop se sincroniza al inicio del clip seleccionado.</p>
          </div>

          {selectedClip && (
            <div className="flex gap-2 px-3 py-2 border-b border-zinc-800 flex-none">
              <button onClick={() => applyWithClip(selectedClip)}
                className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors">
                Confirmar
              </button>
              <button onClick={() => setSelectedClip(null)}
                className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg cursor-pointer transition-colors">
                Volver
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-2 gap-2">
              {sortedClips.map(clip => {
                const isSel = selectedClip?.id === clip.id
                return (
                  <button key={clip.id} onClick={() => handleSelectClip(clip)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer text-left ${isSel ? 'border-violet-500 ring-2 ring-violet-500/40' : 'border-zinc-800 hover:border-zinc-600'}`}>
                    {clip.thumbnail
                      ? <img src={clip.thumbnail} className="w-full aspect-[9/16] object-cover" alt="" />
                      : <div className="w-full aspect-[9/16] bg-zinc-800 flex items-center justify-center"><Film size={18} className="text-zinc-600" /></div>
                    }
                    {isSel && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                    )}
                    <div className="p-1.5">
                      <p className="text-[10px] text-zinc-200 truncate font-medium">{clip.name}</p>
                      <p className="text-[9px] text-zinc-500">{clip.startAt.toFixed(1)}s</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-3 pb-3 pt-2 border-t border-zinc-800 flex-none flex flex-col gap-1">
            <button onClick={applyWithoutSync}
              className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer border border-zinc-800 rounded-lg">
              Sin showcase
            </button>
            <button onClick={() => { setPendingDropSong(null); setSelectedClip(null) }}
              className="w-full py-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Audio Local Pane ──────────────────────────────────────────────────────────

function AudioLocalPane({ audio, audioInputRef, songInputRef, onImport, onRemove }: {
  audio: AudioTrack | null
  audioInputRef: React.RefObject<HTMLInputElement | null>
  songInputRef:  React.RefObject<HTMLInputElement | null>
  onImport: (files: FileList | null) => void
  onRemove: () => void
}) {
  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
      <input ref={songInputRef} type="file" accept="audio/*" className="hidden" onChange={e => onImport(e.target.files)} />
      {!audio ? (
        <button onClick={() => audioInputRef.current?.click()}
          className="w-full flex items-center gap-2 justify-center border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl py-6 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
          <Music size={16} />Importar desde dispositivo
        </button>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Music size={14} className="text-violet-400 flex-none" />
            <p className="text-sm text-zinc-200 truncate flex-1">{audio.name}</p>
          </div>
          <p className="text-xs text-zinc-500">{audio.duration.toFixed(1)}s</p>
          <button onClick={onRemove}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer">
            <Trash2 size={11} />Quitar
          </button>
        </div>
      )}
    </div>
  )
}
