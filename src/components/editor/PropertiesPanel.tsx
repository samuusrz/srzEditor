import { Trash2 } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem } from '../../types/editor'

interface Props {
  selected: SelectedItem
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  totalDuration: number
  onUpdateText: (id: string, patch: Partial<TextOverlay>) => void
  onRemoveText: (id: string) => void
  onUpdateAudio: (patch: Partial<AudioTrack>) => void
  onRemoveAudio: () => void
  onRemoveClip: (id: string) => void
}

export function PropertiesPanel({
  selected, clips, texts, audio, totalDuration,
  onUpdateText, onRemoveText, onUpdateAudio, onRemoveAudio, onRemoveClip,
}: Props) {
  if (!selected) {
    return (
      <div className="w-60 flex-none bg-zinc-950 border-l border-zinc-800 flex items-center justify-center">
        <p className="text-xs text-zinc-600 text-center px-4">Selecciona un elemento para editar sus propiedades</p>
      </div>
    )
  }

  const clip = selected.type === 'clip' ? clips.find(c => c.id === selected.id) : null
  const text = selected.type === 'text' ? texts.find(t => t.id === selected.id) : null

  return (
    <div className="w-60 flex-none bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          {selected.type === 'clip' ? 'Clip' : selected.type === 'text' ? 'Texto' : 'Audio'}
        </p>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {/* ── Clip properties ── */}
        {clip && (
          <>
            <div>
              <Label>Nombre</Label>
              <p className="text-sm text-zinc-200 truncate">{clip.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duración</Label>
                <p className="text-sm text-zinc-200">{clip.duration.toFixed(2)}s</p>
              </div>
              <div>
                <Label>Original</Label>
                <p className="text-sm text-zinc-200">{clip.originalDuration.toFixed(2)}s</p>
              </div>
            </div>
            <button
              onClick={() => onRemoveClip(clip.id)}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer mt-auto"
            >
              <Trash2 size={13} />
              Eliminar clip
            </button>
          </>
        )}

        {/* ── Text properties ── */}
        {text && (
          <>
            <div>
              <Label>Contenido</Label>
              <textarea
                value={text.content}
                onChange={e => onUpdateText(text.id, { content: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-violet-500"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aparece en</Label>
                <input
                  type="number"
                  min={0}
                  max={totalDuration}
                  step={0.1}
                  value={text.startAt}
                  onChange={e => onUpdateText(text.id, { startAt: +e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <Label>Duración</Label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={text.duration}
                  onChange={e => onUpdateText(text.id, { duration: +e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Posición X (%)</Label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(text.x)}
                  onChange={e => onUpdateText(text.id, { x: +e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <Label>Posición Y (%)</Label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(text.y)}
                  onChange={e => onUpdateText(text.id, { y: +e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <Label>Tamaño fuente (px)</Label>
              <input
                type="range"
                min={16}
                max={120}
                value={text.fontSize}
                onChange={e => onUpdateText(text.id, { fontSize: +e.target.value })}
                className="w-full accent-violet-500"
              />
              <span className="text-xs text-zinc-500">{text.fontSize}px</span>
            </div>

            <div>
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={text.color}
                  onChange={e => onUpdateText(text.id, { color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs text-zinc-400 font-mono">{text.color}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Negrita</Label>
              <button
                onClick={() => onUpdateText(text.id, { bold: !text.bold })}
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${text.bold ? 'bg-violet-500' : 'bg-zinc-700'}`}
              >
                <span className={`block w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${text.bold ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <button
              onClick={() => onRemoveText(text.id)}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer mt-auto"
            >
              <Trash2 size={13} />
              Eliminar texto
            </button>
          </>
        )}

        {/* ── Audio properties ── */}
        {selected.type === 'audio' && audio && (
          <>
            <div>
              <Label>Canción</Label>
              <p className="text-sm text-zinc-200 truncate">{audio.name}</p>
            </div>
            <div>
              <Label>Duración</Label>
              <p className="text-sm text-zinc-200">{audio.duration.toFixed(1)}s</p>
            </div>
            <div>
              <Label>Volumen</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audio.volume}
                onChange={e => onUpdateAudio({ volume: +e.target.value })}
                className="w-full accent-violet-500"
              />
              <span className="text-xs text-zinc-500">{Math.round(audio.volume * 100)}%</span>
            </div>
            <div>
              <Label>Inicio en (s)</Label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={audio.startAt}
                onChange={e => onUpdateAudio({ startAt: +e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
              />
            </div>
            <button
              onClick={onRemoveAudio}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer mt-auto"
            >
              <Trash2 size={13} />
              Quitar audio
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{children}</p>
}
