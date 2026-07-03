import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, LayoutTemplate, Clock, Film } from 'lucide-react'
import { getTemplates, getTemplateWithSlots, createTemplate, updateTemplate, deleteTemplate } from '../lib/db'
import type { Template, TemplateWithSlots } from '../types'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { TemplateEditor } from '../components/templates/TemplateEditor'
import type { TemplateFormData } from '../components/templates/TemplateEditor'

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TemplateWithSlots | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const load = () => {
    setLoading(true)
    getTemplates()
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (data: TemplateFormData) => {
    await createTemplate(
      {
        name: data.name,
        description: data.description || null,
        aspect_ratio: '9:16',
        fps: 60,
        resolution: '1080p',
        total_duration: data.total_duration,
      },
      data.clip_slots.map(({ localId: _, ...s }) => s),
      data.text_slots.map(({ localId: _, ...s }) => ({ ...s, default_text_id: null })),
      data.audio_slot ? { ...data.audio_slot, default_song_id: null } : null,
    )
    setCreating(false)
    load()
  }

  const handleEdit = async (data: TemplateFormData) => {
    if (!editing) return
    await updateTemplate(
      editing.id,
      {
        name: data.name,
        description: data.description || null,
        total_duration: data.total_duration,
      },
      data.clip_slots.map(({ localId: _, ...s }) => s),
      data.text_slots.map(({ localId: _, ...s }) => ({ ...s, default_text_id: null })),
      data.audio_slot ? { ...data.audio_slot, default_song_id: null } : null,
    )
    setEditing(null)
    load()
  }

  const openEdit = async (t: Template) => {
    const full = await getTemplateWithSlots(t.id)
    setEditing(full)
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    await deleteTemplate(deleting.id)
    setDeleting(null)
    setDeleteLoading(false)
    load()
  }

  // Convert saved template slots to LocalClipSlot format for editing
  const editingFormData = editing
    ? {
        name: editing.name,
        description: editing.description ?? '',
        total_duration: editing.total_duration,
        clip_slots: editing.clip_slots.map(s => ({ ...s, localId: s.id })),
        text_slots: editing.text_slots.map(s => ({ ...s, localId: s.id })),
        audio_slot: editing.audio_slot ? { start_at: editing.audio_slot.start_at } : null,
      }
    : undefined

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Plantillas</h1>
          <p className="text-zinc-500 text-sm mt-1">Define la estructura reutilizable de tus vídeos</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={15} />
          Nueva plantilla
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={48} />}
          title="Sin plantillas todavía"
          description="Crea tu primera plantilla para empezar a montar vídeos"
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus size={13} />
              Crear plantilla
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 max-w-3xl">
          {templates.map(t => (
            <div
              key={t.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-zinc-700 transition-colors"
            >
              <div className="w-10 h-10 bg-violet-900/30 rounded-lg flex items-center justify-center shrink-0">
                <LayoutTemplate size={18} className="text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-zinc-100 text-sm truncate">{t.name}</p>
                {t.description && (
                  <p className="text-zinc-500 text-xs mt-0.5 truncate">{t.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-zinc-600 flex items-center gap-1">
                    <Clock size={11} />
                    {t.total_duration}s
                  </span>
                  <span className="text-xs text-zinc-600 flex items-center gap-1">
                    <Film size={11} />
                    {t.fps}fps · {t.resolution}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(t)}>
                  <Trash2 size={14} className="text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        title="Nueva plantilla"
        open={creating}
        onClose={() => setCreating(false)}
        width="max-w-2xl"
      >
        <TemplateEditor
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        title="Editar plantilla"
        open={!!editing}
        onClose={() => setEditing(null)}
        width="max-w-2xl"
      >
        {editing && (
          <TemplateEditor
            initial={editingFormData}
            onSave={handleEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        title="Eliminar plantilla"
        open={!!deleting}
        onClose={() => setDeleting(null)}
        width="max-w-sm"
      >
        <p className="text-zinc-400 text-sm mb-5">
          ¿Eliminar <strong className="text-zinc-200">{deleting?.name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>Eliminar</Button>
        </div>
      </Modal>
    </div>
  )
}
