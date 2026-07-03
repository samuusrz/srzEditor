import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Type, Tag } from 'lucide-react'
import { getTextLibrary, createTextItem, updateTextItem, deleteTextItem } from '../lib/db'
import type { TextLibraryItem } from '../types'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Textarea } from '../components/ui/Input'

interface TextFormState {
  content: string
  tags: string
}

function TextFormModal({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean
  initial?: TextLibraryItem
  onSave: (content: string, tags: string[]) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<TextFormState>({ content: '', tags: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({
        content: initial?.content ?? '',
        tags: (initial?.tags ?? []).join(', '),
      })
    }
  }, [open, initial])

  const handleSave = async () => {
    if (!form.content.trim()) return
    setSaving(true)
    const tags = form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
    await onSave(form.content.trim(), tags)
    setSaving(false)
  }

  return (
    <Modal title={initial ? 'Editar texto' : 'Nuevo texto'} open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Texto" hint="El texto que aparecerá en el vídeo">
          <Textarea
            rows={3}
            placeholder="ej: ¡Este producto cambia todo!"
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          />
        </Field>
        <Field label="Tags (separados por coma)">
          <Input
            placeholder="ej: gancho, urgencia, CTA"
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
          />
        </Field>
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function TextsPage() {
  const [items, setItems] = useState<TextLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TextLibraryItem | null>(null)
  const [deleting, setDeleting] = useState<TextLibraryItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const load = () => {
    setLoading(true)
    getTextLibrary().then(setItems).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (content: string, tags: string[]) => {
    await createTextItem(content, tags)
    setCreating(false)
    load()
  }

  const handleEdit = async (content: string, tags: string[]) => {
    if (!editing) return
    await updateTextItem(editing.id, content, tags)
    setEditing(null)
    load()
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    await deleteTextItem(deleting.id)
    setDeleting(null)
    setDeleteLoading(false)
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Librería de textos</h1>
          <p className="text-zinc-500 text-sm mt-1">Textos que han funcionado — reutilízalos en cualquier vídeo</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={15} />
          Nuevo texto
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Type size={48} />}
          title="Sin textos todavía"
          description="Añade textos que te hayan funcionado para reutilizarlos"
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus size={13} />
              Añadir texto
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 max-w-2xl">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-100 text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.tags.map(tag => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 text-xs bg-zinc-800 text-zinc-500 rounded-md px-2 py-0.5"
                        >
                          <Tag size={9} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                    <Pencil size={13} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(item)}>
                    <Trash2 size={13} className="text-red-400" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TextFormModal open={creating} onSave={handleCreate} onClose={() => setCreating(false)} />
      <TextFormModal open={!!editing} initial={editing ?? undefined} onSave={handleEdit} onClose={() => setEditing(null)} />

      <Modal title="Eliminar texto" open={!!deleting} onClose={() => setDeleting(null)} width="max-w-sm">
        <p className="text-zinc-400 text-sm mb-5">¿Eliminar este texto de la librería?</p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleteLoading} onClick={handleDelete}>Eliminar</Button>
        </div>
      </Modal>
    </div>
  )
}
