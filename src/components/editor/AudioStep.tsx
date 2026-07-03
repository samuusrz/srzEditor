import { useEffect, useState } from 'react'
import { Music, Clock } from 'lucide-react'
import { getSongLibrary } from '../../lib/db'
import type { TemplateWithSlots, SongLibraryItem } from '../../types'
import { Button } from '../ui/Button'
import { Input, Field } from '../ui/Input'

interface AudioStepProps {
  template: TemplateWithSlots
  audio: { song: SongLibraryItem; startAt: number } | null
  onChange: (audio: { song: SongLibraryItem; startAt: number } | null) => void
  onNext: () => void
  onBack: () => void
}

export function AudioStep({ template, audio, onChange, onNext, onBack }: AudioStepProps) {
  const [songs, setSongs] = useState<SongLibraryItem[]>([])
  const [loading, setLoading] = useState(true)

  const defaultStart = template.audio_slot?.start_at ?? 0

  useEffect(() => {
    getSongLibrary().then(setSongs).catch(console.error).finally(() => setLoading(false))
  }, [])

  const selectSong = (song: SongLibraryItem) => {
    onChange({ song, startAt: audio?.startAt ?? defaultStart })
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Música</h2>
      <p className="text-zinc-500 text-sm mb-6">
        Elige una canción de tu librería
        {template.audio_slot && (
          <span className="ml-1">— la plantilla la coloca en el segundo <strong className="text-zinc-300">{defaultStart}s</strong></span>
        )}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : songs.length === 0 ? (
        <div className="bg-zinc-900 border border-dashed border-zinc-800 rounded-xl p-8 text-center mb-6">
          <Music size={24} className="text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">Sin canciones en la librería</p>
          <p className="text-zinc-600 text-xs mt-1">Ve a la sección Canciones para añadir</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {songs.map(song => {
            const selected = audio?.song.id === song.id
            return (
              <button
                key={song.id}
                onClick={() => selectSong(song)}
                className={`
                  w-full text-left flex items-center gap-4 px-4 py-3 rounded-xl border transition-all cursor-pointer
                  ${selected
                    ? 'bg-violet-900/20 border-violet-700'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                  }
                `}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${selected ? 'bg-violet-800/50' : 'bg-zinc-800'}`}>
                  <Music size={15} className={selected ? 'text-violet-400' : 'text-zinc-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{song.name}</p>
                  {song.duration && (
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <Clock size={10} />{song.duration}s
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {audio && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-5">
          <Field
            label="Segundo de entrada"
            hint={`La plantilla sugiere ${defaultStart}s — puedes cambiarlo`}
          >
            <Input
              type="number"
              min={0}
              step={0.1}
              value={audio.startAt}
              onChange={e => onChange({ ...audio, startAt: parseFloat(e.target.value) || 0 })}
            />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
          disabled={!audio}
        >
          Sin música
        </Button>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>Atrás</Button>
          <Button variant="primary" onClick={onNext}>
            Siguiente: Exportar
          </Button>
        </div>
      </div>
    </div>
  )
}
