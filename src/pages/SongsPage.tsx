import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Music, Play, Pause, FolderPlus, Folder, FolderOpen, ChevronRight, ChevronDown, ImagePlus, X } from 'lucide-react'
import { getSongLibrary, createSongItem, deleteSongItem, getPublicUrl } from '../lib/db'
import type { SongLibraryItem } from '../types'
import { getAllSongCovers, setSongCover, removeSongCover } from '../lib/songCovers'
import { getSongFolders, saveSongFolders, type SongFolder } from '../lib/songFolders'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return m > 0 ? `${m}:${sec}` : `0:${sec}`
}

// ── SongRow ───────────────────────────────────────────────────────────────────

function SongRow({
  song, playing, cover, folders,
  onTogglePlay, onDelete, onCoverChange, onSetFolder,
}: {
  song: SongLibraryItem
  playing: boolean
  cover: string | null
  folders: SongFolder[]
  onTogglePlay: () => void
  onDelete: () => void
  onCoverChange: (file: File) => void
  onSetFolder: (folderId: string | null) => void
}) {
  const coverInputRef = useRef<HTMLInputElement>(null)
  const currentFolder = folders.find(f => f.songIds.includes(song.id))

  return (
    <div className="group bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 flex items-center gap-3 hover:border-zinc-700 transition-colors">
      {/* Cover */}
      <div className="relative flex-none">
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onCoverChange(f); e.target.value = '' }} />
        <div
          onClick={() => coverInputRef.current?.click()}
          className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-violet-500 transition-all flex-none relative"
          title="Cambiar portada"
        >
          {cover
            ? <img src={cover} className="w-full h-full object-cover" alt="" />
            : <Music size={16} className="text-zinc-600" />
          }
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
            <ImagePlus size={12} className="text-white" />
          </div>
        </div>
      </div>

      {/* Play */}
      <button
        onClick={onTogglePlay}
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors cursor-pointer ${playing ? 'bg-violet-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
      >
        {playing ? <Pause size={12} className="text-white" /> : <Play size={12} className="text-zinc-400 fill-zinc-400" />}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200 truncate">{song.name}</p>
        {song.duration && <p className="text-[11px] text-zinc-500">{fmt(song.duration)}</p>}
      </div>

      {/* Folder selector */}
      <select
        value={currentFolder?.id ?? ''}
        onChange={e => onSetFolder(e.target.value || null)}
        onClick={e => e.stopPropagation()}
        className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-md px-1.5 py-1 cursor-pointer focus:outline-none focus:border-violet-500 max-w-[90px] truncate opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <option value="">Sin carpeta</option>
        {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>

      {/* Delete */}
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-500 hover:text-red-400 cursor-pointer">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ── SongsPage ─────────────────────────────────────────────────────────────────

export function SongsPage() {
  const [songs, setSongs] = useState<SongLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState<string | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [folders, setFolders] = useState<SongFolder[]>([])
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)

  // Upload state
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [uploading, setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = () => {
    setLoading(true)
    getSongLibrary().then(setSongs).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    setCovers(getAllSongCovers())
    setFolders(getSongFolders())
  }, [])

  const handleUpload = async () => {
    if (!pendingFile || !pendingName.trim()) return
    setUploading(true)
    try {
      await createSongItem(pendingName.trim(), pendingFile)
      setPendingFile(null); setPendingName('')
      load()
    } catch (e) { console.error(e) }
    setUploading(false)
  }

  const handleDelete = async (song: SongLibraryItem) => {
    if (!confirm(`¿Eliminar "${song.name}"?`)) return
    if (playing === song.id) { audioRef.current?.pause(); setPlaying(null) }
    await deleteSongItem(song.id, song.storage_path).catch(console.error)
    removeSongCover(song.id)
    setFolders(prev => {
      const next = prev.map(f => ({ ...f, songIds: f.songIds.filter(id => id !== song.id) }))
      saveSongFolders(next); return next
    })
    load()
  }

  const handleCoverChange = async (song: SongLibraryItem, file: File) => {
    const dataUrl = await setSongCover(song.id, file).catch(() => null)
    if (dataUrl) setCovers(prev => ({ ...prev, [song.id]: dataUrl }))
  }

  const togglePlay = (song: SongLibraryItem) => {
    if (playing === song.id) {
      audioRef.current?.pause(); setPlaying(null)
    } else {
      audioRef.current?.pause()
      const a = new Audio(getPublicUrl(song.storage_path))
      a.onended = () => setPlaying(null)
      audioRef.current = a
      a.play()
      setPlaying(song.id)
    }
  }

  const createFolder = () => {
    if (!newFolderName.trim()) return
    const next = [...folders, { id: crypto.randomUUID(), name: newFolderName.trim(), songIds: [], collapsed: false }]
    saveSongFolders(next); setFolders(next)
    setNewFolderName(''); setShowNewFolder(false)
  }

  const deleteFolder = (folderId: string) => {
    const next = folders.filter(f => f.id !== folderId)
    saveSongFolders(next); setFolders(next)
  }

  const toggleFolder = (folderId: string) => {
    const next = folders.map(f => f.id === folderId ? { ...f, collapsed: !f.collapsed } : f)
    saveSongFolders(next); setFolders(next)
  }

  const setFolder = (songId: string, folderId: string | null) => {
    const next = folders.map(f => ({
      ...f,
      songIds: folderId === f.id
        ? [...new Set([...f.songIds, songId])]
        : f.songIds.filter(id => id !== songId),
    }))
    saveSongFolders(next); setFolders(next)
  }

  // Group songs
  const assignedSongIds = new Set(folders.flatMap(f => f.songIds))
  const unassigned = songs.filter(s => !assignedSongIds.has(s.id))

  const rowProps = (song: SongLibraryItem) => ({
    song,
    playing: playing === song.id,
    cover: covers[song.id] ?? null,
    folders,
    onTogglePlay: () => togglePlay(song),
    onDelete: () => handleDelete(song),
    onCoverChange: (file: File) => handleCoverChange(song, file),
    onSetFolder: (fid: string | null) => setFolder(song.id, fid),
  })

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Canciones</h1>
          <p className="text-zinc-500 text-sm mt-1">Biblioteca de canciones para tus vídeos</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFolder(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors cursor-pointer"
          >
            <FolderPlus size={14} />Nueva carpeta
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={14} />Añadir canción
          </button>
          <input ref={uploadInputRef} type="file" accept="audio/*" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setPendingFile(f); setPendingName(f.name.replace(/\.[^.]+$/, '')) }
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex gap-2 mb-4">
          <input
            value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
            placeholder="Nombre de la carpeta..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
            autoFocus
          />
          <button onClick={createFolder} disabled={!newFolderName.trim()}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded-lg cursor-pointer transition-colors">
            Crear
          </button>
          <button onClick={() => setShowNewFolder(false)} className="p-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Upload pending */}
      {pendingFile && (
        <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Subiendo canción</p>
          <input
            value={pendingName} onChange={e => setPendingName(e.target.value)}
            placeholder="Nombre de la canción"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
          />
          <div className="flex gap-2">
            <button onClick={handleUpload} disabled={uploading || !pendingName.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm rounded-lg py-1.5 cursor-pointer transition-colors">
              {uploading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus size={13} />}
              {uploading ? 'Subiendo...' : 'Subir'}
            </button>
            <button onClick={() => { setPendingFile(null); setPendingName('') }}
              className="px-3 text-zinc-500 hover:text-zinc-300 text-sm cursor-pointer">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : songs.length === 0 ? (
        <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-10 text-center">
          <Music size={36} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-400 text-sm">Sin canciones todavía</p>
          <button onClick={() => uploadInputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition-colors cursor-pointer">
            <Plus size={13} />Añadir canción
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Folders */}
          {folders.map(folder => {
            const folderSongs = songs.filter(s => folder.songIds.includes(s.id))
            return (
              <div key={folder.id}>
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => toggleFolder(folder.id)} className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors">
                    {folder.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    {folder.collapsed ? <Folder size={14} className="text-amber-400" /> : <FolderOpen size={14} className="text-amber-400" />}
                    {folder.name}
                    <span className="text-[11px] text-zinc-600 font-normal ml-1">({folderSongs.length})</span>
                  </button>
                  <button onClick={() => deleteFolder(folder.id)} className="ml-auto p-0.5 text-zinc-700 hover:text-red-400 cursor-pointer transition-colors" title="Eliminar carpeta">
                    <X size={12} />
                  </button>
                </div>
                {!folder.collapsed && (
                  <div className="flex flex-col gap-1.5 pl-4 border-l border-zinc-800">
                    {folderSongs.length === 0
                      ? <p className="text-xs text-zinc-600 py-2">Carpeta vacía · Asigna canciones con el selector</p>
                      : folderSongs.map(song => <SongRow key={song.id} {...rowProps(song)} />)
                    }
                  </div>
                )}
              </div>
            )
          })}

          {/* Unassigned */}
          {unassigned.length > 0 && (
            <div>
              {folders.length > 0 && <p className="text-xs text-zinc-600 uppercase tracking-wide mb-2">Sin carpeta</p>}
              <div className="flex flex-col gap-1.5">
                {unassigned.map(song => <SongRow key={song.id} {...rowProps(song)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
