import { useRef, useState } from 'react'
import { Trash2, Volume2, VolumeX, Smile } from 'lucide-react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem } from '../../types/editor'
import { EmojiPicker } from './EmojiPicker'

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
  onSetClipVolume: (id: string, volume: number) => void
  onToggleClipMute: (id: string) => void
}

export function PropertiesPanel({
  selected, clips, texts, audio, totalDuration,
  onUpdateText, onRemoveText, onUpdateAudio, onRemoveAudio, onRemoveClip,
  onSetClipVolume, onToggleClipMute,
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

        {/* ── Clip ── */}
        {clip && (
          <>
            <div>
              <Label>Nombre</Label>
              <p className="text-sm text-zinc-200 truncate">{clip.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Duración</Label><p className="text-sm text-zinc-200">{clip.duration.toFixed(2)}s</p></div>
              <div><Label>Original</Label><p className="text-sm text-zinc-200">{clip.originalDuration.toFixed(2)}s</p></div>
            </div>

            {/* Volume */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Volumen</Label>
                <button
                  onClick={() => onToggleClipMute(clip.id)}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                  title={clip.muted ? 'Activar sonido' : 'Silenciar'}
                >
                  {clip.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
              </div>
              <input
                type="range" min={0} max={1} step={0.01}
                value={clip.muted ? 0 : clip.volume}
                onChange={e => onSetClipVolume(clip.id, +e.target.value)}
                className="w-full accent-violet-500"
                disabled={clip.muted}
              />
              <span className="text-xs text-zinc-500">{clip.muted ? 'Silenciado' : `${Math.round(clip.volume * 100)}%`}</span>
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

        {/* ── Text ── */}
        {text && <TextProps text={text} totalDuration={totalDuration} onUpdate={onUpdateText} onRemove={onRemoveText} />}

        {/* ── Audio ── */}
        {selected.type === 'audio' && audio && (
          <>
            <div><Label>Canción</Label><p className="text-sm text-zinc-200 truncate">{audio.name}</p></div>
            <div><Label>Duración</Label><p className="text-sm text-zinc-200">{audio.duration.toFixed(1)}s</p></div>
            <div>
              <Label>Volumen ({Math.round(audio.volume * 100)}%)</Label>
              <input type="range" min={0} max={1} step={0.01}
                value={audio.volume}
                onChange={e => onUpdateAudio({ volume: +e.target.value })}
                className="w-full accent-violet-500"
              />
            </div>
            <div>
              <Label>Inicio (s)</Label>
              <input type="number" min={0} step={0.1}
                value={audio.startAt}
                onChange={e => onUpdateAudio({ startAt: +e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="border-t border-zinc-800 pt-3">
              <Label>Fade in ({audio.fadeIn.toFixed(1)}s)</Label>
              <input type="range" min={0} max={10} step={0.1}
                value={audio.fadeIn}
                onChange={e => onUpdateAudio({ fadeIn: +e.target.value })}
                className="w-full accent-violet-500"
              />
            </div>
            <div>
              <Label>Fade out ({audio.fadeOut.toFixed(1)}s)</Label>
              <input type="range" min={0} max={10} step={0.1}
                value={audio.fadeOut}
                onChange={e => onUpdateAudio({ fadeOut: +e.target.value })}
                className="w-full accent-violet-500"
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

// ── TextProps (extracted to use hooks) ────────────────────────────────────────

function TextProps({
  text, totalDuration, onUpdate, onRemove,
}: {
  text: TextOverlay
  totalDuration: number
  onUpdate: (id: string, patch: Partial<TextOverlay>) => void
  onRemove: (id: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showEmoji, setShowEmoji] = useState(false)

  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    if (!el) {
      onUpdate(text.id, { content: text.content + emoji })
      return
    }
    const start = el.selectionStart ?? text.content.length
    const end   = el.selectionEnd   ?? text.content.length
    const next  = text.content.slice(0, start) + emoji + text.content.slice(end)
    onUpdate(text.id, { content: next })
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + [...emoji].length // grapheme-safe cursor advance
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Contenido</Label>
          <button
            onClick={() => setShowEmoji(v => !v)}
            className={`flex items-center gap-1 text-[11px] transition-colors cursor-pointer rounded px-1 py-0.5 ${
              showEmoji ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Insertar emoji"
          >
            <Smile size={11} />
            Emoji
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={text.content}
          onChange={e => onUpdate(text.id, { content: e.target.value })}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-violet-500 font-mono"
          rows={3}
          wrap="off"
          style={{ whiteSpace: 'pre', overflowX: 'auto' }}
        />
        <p className="text-[10px] text-zinc-600 mt-1">Enter para nueva línea</p>
      </div>

      {showEmoji && <EmojiPicker onSelect={insertEmoji} />}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Inicio (s)</Label>
          <input type="number" min={0} max={totalDuration} step={0.1}
            value={text.startAt}
            onChange={e => onUpdate(text.id, { startAt: +e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <Label>Duración (s)</Label>
          <input type="number" min={0.1} step={0.1}
            value={text.duration}
            onChange={e => onUpdate(text.id, { duration: +e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>X (%)</Label>
          <input type="number" min={0} max={100}
            value={Math.round(text.x)}
            onChange={e => onUpdate(text.id, { x: +e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <Label>Y (%)</Label>
          <input type="number" min={0} max={100}
            value={Math.round(text.y)}
            onChange={e => onUpdate(text.id, { y: +e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      <div>
        <Label>Tamaño ({text.fontSize}px)</Label>
        <input type="range" min={10} max={200}
          value={text.fontSize}
          onChange={e => onUpdate(text.id, { fontSize: +e.target.value })}
          className="w-full accent-violet-500"
        />
      </div>

      <div>
        <Label>Color</Label>
        <div className="flex items-center gap-2">
          <input type="color" value={text.color}
            onChange={e => onUpdate(text.id, { color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
          />
          <span className="text-xs text-zinc-400 font-mono">{text.color}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label>Negrita</Label>
        <Toggle value={text.bold} onChange={v => onUpdate(text.id, { bold: v })} />
      </div>

      <button
        onClick={() => onRemove(text.id)}
        className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer mt-auto"
      >
        <Trash2 size={13} />
        Eliminar texto
      </button>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{children}</p>
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-none ${value ? 'bg-violet-500' : 'bg-zinc-700'}`}
    >
      <span className={`block w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}
