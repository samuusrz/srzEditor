import { useState } from 'react'
import { Plus, Trash2, GripVertical } from 'lucide-react'
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
import { Button } from '../ui/Button'
import { Input, Field, Textarea } from '../ui/Input'
import type { TemplateClipSlot, TemplateTextSlot, TemplateAudioSlot } from '../../types'

type LocalClipSlot = Omit<TemplateClipSlot, 'id' | 'template_id'> & { localId: string }
type LocalTextSlot = Omit<TemplateTextSlot, 'id' | 'template_id' | 'default_text_id'> & { localId: string }
type LocalAudioSlot = Omit<TemplateAudioSlot, 'id' | 'template_id' | 'default_song_id'>

export interface TemplateFormData {
  name: string
  description: string
  total_duration: number
  clip_slots: LocalClipSlot[]
  text_slots: LocalTextSlot[]
  audio_slot: LocalAudioSlot | null
}

interface TemplateEditorProps {
  initial?: Partial<TemplateFormData>
  onSave: (data: TemplateFormData) => Promise<void>
  onCancel: () => void
}

function SortableClipSlot({
  slot,
  index,
  onChange,
  onDelete,
}: {
  slot: LocalClipSlot
  index: number
  onChange: (updated: LocalClipSlot) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: slot.localId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex gap-3 items-start"
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={16} />
      </button>
      <div className="w-6 h-6 bg-violet-900/50 rounded-md flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-violet-400">{index + 1}</span>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2">
        <Field label="Label">
          <Input
            placeholder="ej: intro caminando"
            value={slot.label}
            onChange={e => onChange({ ...slot, label: e.target.value })}
          />
        </Field>
        <Field label="Duración (s)">
          <Input
            type="number"
            min={0.5}
            max={25}
            step={0.5}
            value={slot.duration}
            onChange={e => onChange({ ...slot, duration: parseFloat(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <button
        onClick={onDelete}
        className="mt-1 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function TextSlotRow({
  slot,
  onChange,
  onDelete,
}: {
  slot: LocalTextSlot
  onChange: (updated: LocalTextSlot) => void
  onDelete: () => void
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex gap-3 items-start">
      <div className="flex-1 grid grid-cols-4 gap-2">
        <Field label="X (%)">
          <Input
            type="number" min={0} max={100}
            value={slot.position_x}
            onChange={e => onChange({ ...slot, position_x: parseFloat(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Y (%)">
          <Input
            type="number" min={0} max={100}
            value={slot.position_y}
            onChange={e => onChange({ ...slot, position_y: parseFloat(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Empieza (s)">
          <Input
            type="number" min={0} step={0.1}
            value={slot.start_at}
            onChange={e => onChange({ ...slot, start_at: parseFloat(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Termina (s)">
          <Input
            type="number" min={0} step={0.1}
            value={slot.end_at}
            onChange={e => onChange({ ...slot, end_at: parseFloat(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <button
        onClick={onDelete}
        className="mt-6 text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

let _id = 0
const uid = () => `local_${++_id}`

const defaultFormData = (): TemplateFormData => ({
  name: '',
  description: '',
  total_duration: 15,
  clip_slots: [],
  text_slots: [],
  audio_slot: { start_at: 0 },
})

export function TemplateEditor({ initial, onSave, onCancel }: TemplateEditorProps) {
  const [form, setForm] = useState<TemplateFormData>(() => ({
    ...defaultFormData(),
    ...initial,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = form.clip_slots.findIndex(s => s.localId === active.id)
      const newIndex = form.clip_slots.findIndex(s => s.localId === over.id)
      const reordered = arrayMove(form.clip_slots, oldIndex, newIndex).map((s, i) => ({
        ...s,
        slot_order: i + 1,
      }))
      // Recalculate start_at
      let cursor = 0
      const recalculated = reordered.map(s => {
        const start = cursor
        cursor += s.duration
        return { ...s, start_at: start }
      })
      setForm(f => ({ ...f, clip_slots: recalculated }))
    }
  }

  const addClipSlot = () => {
    const last = form.clip_slots[form.clip_slots.length - 1]
    const start = last ? last.start_at + last.duration : 0
    setForm(f => ({
      ...f,
      clip_slots: [
        ...f.clip_slots,
        { localId: uid(), slot_order: f.clip_slots.length + 1, label: '', duration: 3, start_at: start },
      ],
    }))
  }

  const updateClipSlot = (localId: string, updated: LocalClipSlot) => {
    setForm(f => {
      const slots = f.clip_slots.map(s => (s.localId === localId ? updated : s))
      // Recalculate all start_at
      let cursor = 0
      const recalc = slots.map(s => {
        const start = cursor
        cursor += s.duration
        return { ...s, start_at: start }
      })
      const total = cursor
      return { ...f, clip_slots: recalc, total_duration: total }
    })
  }

  const removeClipSlot = (localId: string) => {
    setForm(f => {
      const slots = f.clip_slots.filter(s => s.localId !== localId).map((s, i) => ({ ...s, slot_order: i + 1 }))
      let cursor = 0
      const recalc = slots.map(s => {
        const start = cursor
        cursor += s.duration
        return { ...s, start_at: start }
      })
      return { ...f, clip_slots: recalc, total_duration: cursor || f.total_duration }
    })
  }

  const addTextSlot = () => {
    setForm(f => ({
      ...f,
      text_slots: [
        ...f.text_slots,
        { localId: uid(), position_x: 50, position_y: 10, start_at: 0, end_at: 3 },
      ],
    }))
  }

  const updateTextSlot = (localId: string, updated: LocalTextSlot) => {
    setForm(f => ({ ...f, text_slots: f.text_slots.map(s => (s.localId === localId ? updated : s)) }))
  }

  const removeTextSlot = (localId: string) => {
    setForm(f => ({ ...f, text_slots: f.text_slots.filter(s => s.localId !== localId) }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    if (form.clip_slots.length === 0) { setError('Añade al menos un slot de clip'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
    } catch (e: any) {
      setError(e.message ?? 'Error guardando plantilla')
    } finally {
      setSaving(false)
    }
  }

  const totalDuration = form.clip_slots.reduce((sum, s) => sum + s.duration, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Basic info */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-zinc-300">Información general</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre de la plantilla">
            <Input
              placeholder="ej: Intro producto 15s"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Duración calculada">
            <div className="px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-400 border border-zinc-700">
              {totalDuration.toFixed(1)}s {totalDuration > 25 && <span className="text-red-400">(max 25s)</span>}
            </div>
          </Field>
        </div>
        <Field label="Descripción (opcional)">
          <Textarea
            placeholder="Describe el concepto o uso de esta plantilla"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </Field>
      </section>

      {/* Clip slots */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">Clips ({form.clip_slots.length})</h3>
          <Button variant="ghost" size="sm" onClick={addClipSlot}>
            <Plus size={13} />
            Añadir clip
          </Button>
        </div>
        {form.clip_slots.length === 0 && (
          <p className="text-zinc-600 text-sm text-center py-4">Sin clips — añade slots para definir la estructura</p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={form.clip_slots.map(s => s.localId)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {form.clip_slots.map((slot, i) => (
                <SortableClipSlot
                  key={slot.localId}
                  slot={slot}
                  index={i}
                  onChange={updated => updateClipSlot(slot.localId, updated)}
                  onDelete={() => removeClipSlot(slot.localId)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      {/* Text slots */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">Textos ({form.text_slots.length})</h3>
          <Button variant="ghost" size="sm" onClick={addTextSlot}>
            <Plus size={13} />
            Añadir texto
          </Button>
        </div>
        <p className="text-xs text-zinc-600">Posición en % sobre el frame (0,0 = esquina superior izquierda)</p>
        {form.text_slots.length === 0 && (
          <p className="text-zinc-600 text-sm text-center py-3">Sin slots de texto</p>
        )}
        <div className="flex flex-col gap-2">
          {form.text_slots.map(slot => (
            <TextSlotRow
              key={slot.localId}
              slot={slot}
              onChange={updated => updateTextSlot(slot.localId, updated)}
              onDelete={() => removeTextSlot(slot.localId)}
            />
          ))}
        </div>
      </section>

      {/* Audio slot */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">Música</h3>
          {form.audio_slot ? (
            <Button variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, audio_slot: null }))}>
              Quitar
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, audio_slot: { start_at: 0 } }))}>
              <Plus size={13} />
              Añadir timing
            </Button>
          )}
        </div>
        {form.audio_slot ? (
          <Field label="Entra en el segundo..." hint="Segundo del vídeo final donde empieza la canción">
            <Input
              type="number"
              min={0}
              step={0.1}
              value={form.audio_slot.start_at}
              onChange={e =>
                setForm(f => ({ ...f, audio_slot: { start_at: parseFloat(e.target.value) || 0 } }))
              }
            />
          </Field>
        ) : (
          <p className="text-zinc-600 text-sm text-center py-3">Sin timing de audio</p>
        )}
      </section>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" loading={saving} onClick={handleSubmit}>
          Guardar plantilla
        </Button>
      </div>
    </div>
  )
}
