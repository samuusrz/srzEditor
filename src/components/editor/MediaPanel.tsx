import { useRef, useState } from 'react'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Film, Type, Music, Trash2, Upload } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack } from '../../types/editor'

async function getVideoMeta(file: File): Promise<{ duration: number; thumbnail: string; localUrl: string }> {
  const localUrl = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const vid = document.createElement('video')
    vid.src = localUrl
    vid.preload = 'metadata'
    vid.currentTime = 0.1
    vid.onloadeddata = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 214
      canvas.getContext('2d')!.drawImage(vid, 0, 0, 120, 214)
      resolve({ duration: vid.duration, thumbnail: canvas.toDataURL('image/jpeg', 0.7), localUrl })
    }
    vid.onerror = () => resolve({ duration: 0, thumbnail: '', localUrl })
  })
}

async function getAudioDuration(file: File): Promise<{ duration: number; localUrl: string }> {
  const localUrl = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    audio.src = localUrl
    audio.onloadedmetadata = () => resolve({ duration: audio.duration, localUrl })
    audio.onerror = () => resolve({ duration: 0, localUrl })
  })
}

type Tab = 'media' | 'text' | 'audio'

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

export function MediaPanel({
  clips, texts, audio, totalDuration,
  onAddClip, onRemoveClip, onAddText, onSetAudio, onRemoveAudio,
}: Props) {
  const [tab, setTab] = useState<Tab>('media')
  const [dragging, setDragging] = useState(false)
  const clipInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const importClips = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/')) continue
      const { duration, thumbnail, localUrl } = await getVideoMeta(file)
      const clip: Clip = {
        id: crypto.randomUUID(),
        file,
        localUrl,
        name: file.name.replace(/\.[^.]+$/, ''),
        thumbnail,
        startAt: 0,
        duration,
        originalDuration: duration,
        trimStart: 0,
        volume: 1,
        muted: false,
      }
      onAddClip(clip)
    }
  }

  const importAudio = async (files: FileList | null) => {
    if (!files || !files[0]) return
    const file = files[0]
    const { duration, localUrl } = await getAudioDuration(file)
    onSetAudio({
      id: crypto.randomUUID(),
      file,
      localUrl,
      name: file.name.replace(/\.[^.]+$/, ''),
      startAt: 0,
      duration,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    })
  }

  const addText = () => {
    const text: TextOverlay = {
      id: crypto.randomUUID(),
      content: 'Texto',
      startAt: 0,
      duration: Math.max(3, totalDuration),
      x: 50,
      y: 15,
      fontSize: 48,
      color: '#ffffff',
      bold: true,
    }
    onAddText(text)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'media', label: 'Media', icon: <Film size={14} /> },
    { id: 'text',  label: 'Texto', icon: <Type size={14} /> },
    { id: 'audio', label: 'Audio', icon: <Music size={14} /> },
  ]

  return (
    <div className="w-56 flex-none bg-zinc-950 border-r border-zinc-800 flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors cursor-pointer ${
              tab === t.id ? 'text-violet-400 border-b-2 border-violet-500' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Media tab */}
      {tab === 'media' && (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          <input ref={clipInputRef} type="file" accept="video/*" multiple className="hidden" onChange={e => importClips(e.target.files)} />

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); importClips(e.dataTransfer.files) }}
            onClick={() => clipInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors
              ${dragging ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-700 hover:border-zinc-500'}
            `}
          >
            <Upload size={20} className="text-zinc-500" />
            <p className="text-xs text-zinc-500 text-center">Arrastra vídeos o haz clic</p>
          </div>

          {/* Clip list */}
          {clips.map(clip => (
            <div key={clip.id} className="group relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
              {clip.thumbnail
                ? <img src={clip.thumbnail} className="w-full aspect-video object-cover" alt="" />
                : <div className="w-full aspect-video bg-zinc-800 flex items-center justify-center"><Film size={20} className="text-zinc-600" /></div>
              }
              <div className="px-2 py-1.5 flex items-center justify-between">
                <p className="text-xs text-zinc-300 truncate flex-1">{clip.name}</p>
                <span className="text-[10px] text-zinc-500 ml-1">{clip.duration.toFixed(1)}s</span>
              </div>
              <button
                onClick={() => onRemoveClip(clip.id)}
                className="absolute top-1 right-1 p-1 bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-400 cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {clips.length === 0 && (
            <p className="text-xs text-zinc-600 text-center mt-2">Sin clips importados</p>
          )}
        </div>
      )}

      {/* Text tab */}
      {tab === 'text' && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          <button
            onClick={addText}
            className="w-full flex items-center gap-2 justify-center bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors cursor-pointer"
          >
            <Plus size={14} />
            Añadir texto
          </button>

          {texts.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">En el proyecto</p>
              {texts.map(t => (
                <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 truncate">
                  {t.content || '(vacío)'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audio tab */}
      {tab === 'audio' && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={e => importAudio(e.target.files)} />

          {!audio ? (
            <button
              onClick={() => audioInputRef.current?.click()}
              className="w-full flex items-center gap-2 justify-center border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl py-6 text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <Music size={16} />
              Importar música
            </button>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Music size={14} className="text-violet-400 flex-none" />
                <p className="text-sm text-zinc-200 truncate flex-1">{audio.name}</p>
              </div>
              <p className="text-xs text-zinc-500">{audio.duration.toFixed(1)}s</p>
              <button
                onClick={onRemoveAudio}
                className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                <Trash2 size={11} />
                Quitar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
