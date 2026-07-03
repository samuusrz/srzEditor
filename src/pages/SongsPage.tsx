import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Music, Clock, Play, Pause } from 'lucide-react'
import { getSongLibrary, createSongItem, deleteSongItem, getPublicUrl } from '../lib/db'
import type { SongLibraryItem } from '../types'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input } from '../components/ui/Input'

function AddSongModal({
  open,
  onSave,
  onClose,
}: {
  open: boolean
  onSave: (name: string, file: File) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setName(''); setFile(null) }
  }, [open])

  const handleSave = async () => {
    if (!name.trim() || !file) return
    setSaving(true)
    await onSave(name.trim(), file)
    setSaving(false)
  }

  return (
    <Modal title="Añadir canción" open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input
            placeholder="ej: Phonk verano 2024"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </Field>
        <Field label="Archivo de audio">
          <label className="flex items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-lg px-4 py-5 text-sm cursor-pointer hover:border-zinc-600 transition-colors bg-zinc-900">
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) {
                  setFile(f)
                  if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
                }
              }}
            />
            <Music size={16} className="text-zinc-500" />
            {file ? (
              <span className="text-zinc-300">{file.name}</span>
            ) : (
              <span className="text-zinc-500">Seleccionar archivo MP3/WAV/AAC</span>
            )}
          </label>
        </Field>
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={handleSave} disabled={!name || !file}>
            Subir canción
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function SongsPage() {
  const [songs, setSongs] = useState<SongLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<SongLibraryItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = () => {
    setLoading(true)
    getSongLibrary().then(setSongs).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleAdd = async (name: string, file: File) => {
    await createSongItem(name, file)
    setAdding(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    if (playing === deleting.id) { audioRef.current?.pause(); setPlaying(null) }
    await deleteSongItem(deleting.id, deleting.storage_path)
    setDeleting(null)
    setDeleteLoading(false)
    load()
  }

  const togglePlay = (song: SongLibraryItem) => {
    if (playing === song.id) {
      audioRef.current?.pause()
      setPlaying(null)
    } else {
      if (audioRef.current) audioRef.current.pause()
      const audio = new Audio(getPublicUrl(song.storage_path))
      audio.onended = () => setPlaying(null)
      audioRef.current = audio
      audio.play()
      setPlaying(song.id)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Librería de canciones</h1>
          <p className="text-zinc-500 text-sm mt-1">Canciones guardadas para tus vídeos</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Añadir canción
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : songs.length === 0 ? (
        <EmptyState
          icon={<Music size={48} />}
          title="Sin canciones todavía"
          description="Añade las canciones que usas en tus vídeos"
          action={
            <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
              <Plus size={13} />
              Añadir canción
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {songs.map(song => (
            <div
              key={song.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-zinc-700 transition-colors"
            >
              <button
                onClick={() => togglePlay(song)}
                className={`
                  w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors cursor-pointer
                  ${playing === song.id ? 'bg-violet-600' : 'bg-zinc-800 hover:bg-zinc-700'}
                `}
              >
                {playing === song.id ? (
                  <Pause size={14} className="text-white" />
                ) : (
                  <Play size={14} className="text-zinc-400 fill-zinc-400" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{song.name}</p>
                {song.duration && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {song.duration}s
                  </p>
                )}
              </div>

              <Button variant="ghost" size="sm" onClick={() => setDeleting(song)}>
                <Trash2 size={13} className="text-red-400" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddSongModal open={adding} onSave={handleAdd} onClose={() => setAdding(false)} />

      <Modal title="Eliminar canción" open={!!deleting} onClose={() => setDeleting(null)} width="max-w-sm">
        <p className="text-zinc-400 text-sm mb-5">
          ¿Eliminar <strong className="text-zinc-200">{deleting?.name}</strong>?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>Eliminar</Button>
        </div>
      </Modal>
    </div>
  )
}
