import { useCallback, useState } from 'react'
import { Upload, X, GripVertical, Play } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TemplateWithSlots, ProjectClip } from '../../types'
import { Button } from '../ui/Button'

interface ClipsStepProps {
  template: TemplateWithSlots
  clips: ProjectClip[]
  onChange: (clips: ProjectClip[]) => void
  onNext: () => void
}

let _cid = 0
const uid = () => `clip_${++_cid}`

function SortableClipRow({
  clip,
  slotLabel,
  slotIndex,
  onRemove,
}: {
  clip: ProjectClip
  slotLabel: string
  slotIndex: number
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: clip.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const [playing, setPlaying] = useState(false)

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <button {...attributes} {...listeners} className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing">
        <GripVertical size={16} />
      </button>

      {/* Thumbnail / preview */}
      <div className="relative w-14 h-20 bg-zinc-800 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
        {clip.localUrl ? (
          <>
            <video
              src={clip.localUrl}
              className="w-full h-full object-cover"
              muted
              loop={false}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {!playing && (
              <button
                onClick={e => {
                  e.stopPropagation()
                  const vid = e.currentTarget.parentElement?.querySelector('video')
                  if (vid) { vid.muted = false; vid.play() }
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-colors cursor-pointer"
              >
                <Play size={16} className="text-white fill-white" />
              </button>
            )}
          </>
        ) : (
          <Upload size={16} className="text-zinc-600" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 bg-violet-900/50 rounded-md flex items-center justify-center text-xs font-bold text-violet-400">
            {slotIndex + 1}
          </span>
          <p className="text-sm font-medium text-zinc-200 truncate">{clip.file?.name ?? 'Clip'}</p>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5 ml-7">Slot: {slotLabel}</p>
      </div>

      <button
        onClick={onRemove}
        className="text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
      >
        <X size={15} />
      </button>
    </div>
  )
}

export function ClipsStep({ template, clips, onChange, onNext }: ClipsStepProps) {
  const sensors = useSensors(useSensor(PointerSensor))
  const [dragOver, setDragOver] = useState(false)

  const addFiles = useCallback(
    (files: File[]) => {
      const videoFiles = files.filter(f => f.type.startsWith('video/'))
      const newClips: ProjectClip[] = videoFiles.map((file, i) => {
        const slotIdx = clips.length + i
        const slot = template.clip_slots[slotIdx % template.clip_slots.length]
        return {
          id: uid(),
          project_id: '',
          slot_id: slot?.id ?? '',
          storage_path: '',
          duration_override: null,
          file,
          localUrl: URL.createObjectURL(file),
          slot,
        }
      })
      onChange([...clips, ...newClips])
    },
    [clips, template, onChange],
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIdx = clips.findIndex(c => c.id === active.id)
      const newIdx = clips.findIndex(c => c.id === over.id)
      onChange(arrayMove(clips, oldIdx, newIdx))
    }
  }

  const removeClip = (id: string) => {
    onChange(clips.filter(c => c.id !== id))
  }

  const slotsTotal = template.clip_slots.length
  const filled = clips.length

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Sube los clips</h2>
      <p className="text-zinc-500 text-sm mb-2">
        Plantilla: <strong className="text-zinc-300">{template.name}</strong> — {slotsTotal} slot{slotsTotal !== 1 ? 's' : ''}
      </p>

      {/* Slot labels reference */}
      <div className="flex flex-wrap gap-2 mb-5">
        {template.clip_slots.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1 text-zinc-400">
            <span className="w-4 h-4 bg-violet-900/50 rounded flex items-center justify-center text-xs text-violet-400 font-bold">{i + 1}</span>
            {s.label} — {s.duration}s
          </span>
        ))}
      </div>

      {/* Drop zone */}
      <label
        className={`
          flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl px-6 py-10 mb-5 cursor-pointer transition-colors
          ${dragOver ? 'border-violet-500 bg-violet-900/10' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50'}
        `}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
      >
        <input type="file" multiple accept="video/*" className="hidden" onChange={handleFileInput} />
        <Upload size={24} className={dragOver ? 'text-violet-400' : 'text-zinc-500'} />
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-300">Arrastra clips aquí o haz clic para seleccionar</p>
          <p className="text-xs text-zinc-500 mt-0.5">MP4, MOV, WebM — se asignan automáticamente a los slots en orden</p>
        </div>
      </label>

      {/* Clips list */}
      {clips.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-zinc-400">
              {filled} clip{filled !== 1 ? 's' : ''} cargado{filled !== 1 ? 's' : ''}
              {filled !== slotsTotal && (
                <span className="text-yellow-400 ml-2">
                  (se esperan {slotsTotal})
                </span>
              )}
            </p>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={clips.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {clips.map((clip, i) => (
                  <SortableClipRow
                    key={clip.id}
                    clip={clip}
                    slotIndex={i}
                    slotLabel={template.clip_slots[i]?.label ?? `Slot ${i + 1}`}
                    onRemove={() => removeClip(clip.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={onNext}
          disabled={clips.length === 0}
        >
          Siguiente: Textos
        </Button>
      </div>
    </div>
  )
}
