import { useRef, useState, useEffect } from 'react'
import { Plus, Film, Type, Music, Trash2, Upload, Library, Folder, Loader2 } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack } from '../../types/editor'
import {
  getSongLibrary, createSongItem, deleteSongItem, getPublicUrl,
  getTextLibrary, createTextItem, deleteTextItem,
} from '../../lib/db'
import type { SongLibraryItem, TextLibraryItem } from '../../types'
import { getDropPoint } from '../../lib/dropStorage'

// ── helpers ──────────────────────────────────────────────────────────────────

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
  onSetAudio: (audio: AudioTrack) => void
  onRemoveAudio: () => void
}

// ── component ─────────────────────────────────────────────────────────────────

export function MediaPanel({
  clips, texts, audio, totalDuration,
  onAddClip, onRemoveClip, onAddText, onSetAudio, onRemoveAudio,
}: Props) {
  const [tab,    setTab]    = useState<Tab>('media')
  const [subTab, setSubTab] = useState<SubTab>('library')
  const [dragging, setDragging] = useState(false)

  const clipInputRef  = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const songInputRef  = useRef<HTMLInputElement>(null)

  // ── media import ──────────────────────────────────────────────────────────
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

  const addText = () => {
    onAddText({
      id: crypto.randomUUID(), content: 'Texto',
      startAt: 0, duration: Math.max(3, totalDuration),
      x: 50, y: 15, fontSize: 21, color: '#ffffff', bold: true, track: 0,
    })
  }

  const tabs = [
    { id: 'media' as Tab, label: 'Media', icon: <Film size={14} /> },
    { id: 'text'  as Tab, label: 'Texto', icon: <Type size={14} /> },
    { id: 'audio' as Tab, label: 'Audio', icon: <Music size={14} /> },
  ]

  return (
    <div className="w-56 flex-none bg-zinc-950 border-r border-zinc-800 flex flex-col">
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
            ? <TextLibraryPane onAddText={onAddText} totalDuration={totalDuration} />
            : <TextLocalPane texts={texts} onAddText={addText} />
          }
        </div>
      )}

      {/* ── Audio ── */}
      {tab === 'audio' && (
        <div className="flex-1 flex flex-col min-h-0">
          <SubTabBar value={subTab} onChange={setSubTab} />
          {subTab === 'library'
            ? <AudioLibraryPane onSetAudio={onSetAudio} clips={clips} />
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
      {([['library', <Library size={11} />, 'Biblioteca'], ['local', <Folder size={11} />, 'Local']] as const).map(([id, icon, label]) => (
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

function TextLibraryPane({ onAddText, totalDuration }: { onAddText: (t: TextOverlay) => void; totalDuration: number }) {
  const [items, setItems]   = useState<TextLibraryItem[]>([])
  const [newText, setNewText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    setLoading(true)
    getTextLibrary().then(setItems).catch(console.error).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!newText.trim()) return
    setSaving(true)
    try {
      const item = await createTextItem(newText.trim())
      setItems(prev => [item, ...prev])
      setNewText('')
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const remove = async (item: TextLibraryItem) => {
    await deleteTextItem(item.id).catch(console.error)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  const use = (item: TextLibraryItem) => {
    onAddText({
      id: crypto.randomUUID(), content: item.content,
      startAt: 0, duration: Math.max(3, totalDuration),
      x: 50, y: 15, fontSize: 21, color: '#ffffff', bold: true, track: 0,
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
      {/* Add to library */}
      <div className="flex flex-col gap-1">
        <textarea
          value={newText} onChange={e => setNewText(e.target.value)}
          placeholder="Nuevo texto..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-100 resize-none focus:outline-none focus:border-violet-500"
          rows={2}
        />
        <button onClick={save} disabled={saving || !newText.trim()}
          className="w-full flex items-center gap-1 justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg py-1.5 text-xs cursor-pointer transition-colors">
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Guardar en biblioteca
        </button>
      </div>

      {loading && <p className="text-xs text-zinc-600 text-center">Cargando...</p>}
      {items.map(item => (
        <div key={item.id} className="group bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 flex items-start gap-1">
          <button onClick={() => use(item)} className="flex-1 text-left text-xs text-zinc-300 truncate cursor-pointer hover:text-white transition-colors">
            {item.content}
          </button>
          <button onClick={() => remove(item)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all cursor-pointer flex-none">
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      {!loading && items.length === 0 && <p className="text-xs text-zinc-600 text-center mt-2">Biblioteca vacía</p>}
    </div>
  )
}

// ── Text Local Pane ───────────────────────────────────────────────────────────

function TextLocalPane({ texts, onAddText }: { texts: TextOverlay[]; onAddText: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
      <button onClick={onAddText}
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

function AudioLibraryPane({ onSetAudio, clips }: { onSetAudio: (a: AudioTrack) => void; clips: Clip[] }) {
  const [songs, setSongs]   = useState<SongLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newName, setNewName]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingDropSong, setPendingDropSong] = useState<PendingDropSong | null>(null)

  useEffect(() => {
    setLoading(true)
    getSongLibrary().then(setSongs).catch(console.error).finally(() => setLoading(false))
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
      if (dropAt !== null && clips.length > 0) {
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

  const applyWithClip = (clip: Clip) => {
    if (!pendingDropSong) return
    const { dropAt, file, localUrl, duration, song } = pendingDropSong
    const clipStart = clip.startAt
    const trimStart = Math.max(0, dropAt - clipStart)
    const audioStartAt = Math.max(0, clipStart - dropAt)
    const dur = duration - trimStart
    onSetAudio({
      id: crypto.randomUUID(),
      file,
      localUrl,
      name: song.name,
      startAt: audioStartAt,
      trimStart,
      duration: Math.max(0.1, dur),
      originalDuration: duration,
      volume: 1, fadeIn: 0, fadeOut: 0, keyframes: [],
    })
    setPendingDropSong(null)
  }

  const applyWithoutSync = () => {
    if (!pendingDropSong) return
    const { file, localUrl, duration, song } = pendingDropSong
    onSetAudio({
      id: crypto.randomUUID(), file, localUrl, name: song.name,
      startAt: 0, trimStart: 0, duration, originalDuration: duration,
      volume: 1, fadeIn: 0, fadeOut: 0, keyframes: [],
    })
    setPendingDropSong(null)
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 relative">
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />

      {/* Upload UI */}
      {pendingFile ? (
        <div className="flex flex-col gap-1">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Nombre de la canción"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-violet-500"
          />
          <div className="flex gap-1">
            <button onClick={uploadSong} disabled={uploading || !newName.trim()}
              className="flex-1 flex items-center justify-center gap-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-lg py-1.5 text-xs cursor-pointer transition-colors">
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              Subir
            </button>
            <button onClick={() => { setPendingFile(null); setNewName('') }}
              className="px-2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()}
          className="w-full flex items-center gap-2 justify-center border-2 border-dashed border-zinc-700 hover:border-violet-600 rounded-xl py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
          <Upload size={13} />Subir a biblioteca
        </button>
      )}

      {loading && <p className="text-xs text-zinc-600 text-center">Cargando...</p>}
      {songs.map(song => (
        <div key={song.id} className="group bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 flex items-center gap-1">
          <button onClick={() => useSong(song)} className="flex-1 text-left cursor-pointer hover:text-white transition-colors min-w-0">
            <p className="text-xs text-zinc-300 truncate">{song.name}</p>
            {song.duration && <p className="text-[10px] text-zinc-500">{song.duration.toFixed(1)}s</p>}
          </button>
          <button onClick={() => removeSong(song)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all cursor-pointer flex-none">
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      {!loading && songs.length === 0 && <p className="text-xs text-zinc-600 text-center mt-2">Biblioteca vacía</p>}

      {/* Clip selector modal for drop sync */}
      {pendingDropSong && (
        <div className="absolute inset-0 bg-zinc-950/95 z-10 flex flex-col p-3 gap-2 overflow-y-auto">
          <p className="text-xs font-semibold text-zinc-200">¿Cuál clip es el showcase?</p>
          <p className="text-[10px] text-zinc-500 leading-tight">El Drop se sincronizará al inicio de ese clip.</p>
          <div className="flex flex-col gap-1 mt-1">
            {clips.map(clip => (
              <button
                key={clip.id}
                onClick={() => applyWithClip(clip)}
                className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-2 py-1.5 cursor-pointer transition-colors text-left w-full"
              >
                {clip.thumbnail
                  ? <img src={clip.thumbnail} className="w-7 h-12 object-cover rounded flex-none" alt="" />
                  : <div className="w-7 h-12 bg-zinc-700 rounded flex-none flex items-center justify-center"><Film size={10} className="text-zinc-500" /></div>
                }
                <div className="min-w-0">
                  <p className="text-xs text-zinc-200 truncate">{clip.name}</p>
                  <p className="text-[10px] text-zinc-500">{clip.startAt.toFixed(1)}s · {clip.duration.toFixed(1)}s</p>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={applyWithoutSync}
            className="mt-1 w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer border border-zinc-800 rounded-lg"
          >
            Sin showcase
          </button>
          <button
            onClick={() => setPendingDropSong(null)}
            className="w-full py-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
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
