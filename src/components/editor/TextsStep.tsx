import { useEffect, useState } from 'react'
import { Plus, Trash2, Library } from 'lucide-react'
import { getTextLibrary } from '../../lib/db'
import type { TemplateWithSlots, ProjectText, TextLibraryItem } from '../../types'
import { Button } from '../ui/Button'
import { Input, Field } from '../ui/Input'

interface TextsStepProps {
  template: TemplateWithSlots
  texts: ProjectText[]
  onChange: (texts: ProjectText[]) => void
  onNext: () => void
  onBack: () => void
}

let _tid = 0
const uid = () => `t_${++_tid}`

export function TextsStep({ template, texts, onChange, onNext, onBack }: TextsStepProps) {
  const [library, setLibrary] = useState<TextLibraryItem[]>([])
  const [showLibrary, setShowLibrary] = useState<string | null>(null) // textId picker open

  useEffect(() => {
    getTextLibrary().then(setLibrary).catch(console.error)
  }, [])

  // Initialize texts from template text slots if empty
  useEffect(() => {
    if (texts.length === 0 && template.text_slots.length > 0) {
      onChange(
        template.text_slots.map(slot => ({
          id: uid(),
          project_id: '',
          text_slot_id: slot.id,
          final_text: '',
          position_override_x: null,
          position_override_y: null,
        })),
      )
    }
  }, [template])

  const addText = () => {
    const slot = template.text_slots[texts.length % Math.max(template.text_slots.length, 1)]
    onChange([
      ...texts,
      {
        id: uid(),
        project_id: '',
        text_slot_id: slot?.id ?? null,
        final_text: '',
        position_override_x: null,
        position_override_y: null,
      },
    ])
  }

  const update = (id: string, partial: Partial<ProjectText>) => {
    onChange(texts.map(t => (t.id === id ? { ...t, ...partial } : t)))
  }

  const remove = (id: string) => {
    onChange(texts.filter(t => t.id !== id))
  }

  const pickFromLibrary = (textId: string, libItem: TextLibraryItem) => {
    update(textId, { final_text: libItem.content })
    setShowLibrary(null)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Textos del vídeo</h2>
      <p className="text-zinc-500 text-sm mb-6">
        {template.text_slots.length > 0
          ? `La plantilla define ${template.text_slots.length} slot(s) de texto — edítalos o añade más`
          : 'Añade los textos que quieres que aparezcan en el vídeo'}
      </p>

      {texts.length === 0 && (
        <div className="bg-zinc-900 border border-dashed border-zinc-800 rounded-xl p-8 text-center mb-5">
          <p className="text-zinc-500 text-sm">Sin textos — el vídeo se exportará sin overlay de texto</p>
        </div>
      )}

      <div className="flex flex-col gap-3 mb-5">
        {texts.map((text, i) => {
          const slot = template.text_slots.find(s => s.id === text.text_slot_id)
          return (
            <div key={text.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-zinc-400">
                  Texto {i + 1}
                  {slot && (
                    <span className="ml-2 text-zinc-600">
                      · pos {slot.position_x}% / {slot.position_y}% · {slot.start_at}s→{slot.end_at}s
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLibrary(showLibrary === text.id ? null : text.id)}
                  >
                    <Library size={13} />
                    Librería
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(text.id)}>
                    <Trash2 size={13} className="text-red-400" />
                  </Button>
                </div>
              </div>

              {/* Library picker */}
              {showLibrary === text.id && library.length > 0 && (
                <div className="mb-3 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {library.map(item => (
                    <button
                      key={item.id}
                      onClick={() => pickFromLibrary(text.id, item)}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer border-b border-zinc-700/50 last:border-0"
                    >
                      {item.content}
                    </button>
                  ))}
                </div>
              )}

              <Field label="Texto">
                <Input
                  placeholder="Escribe el texto o elige de la librería..."
                  value={text.final_text}
                  onChange={e => update(text.id, { final_text: e.target.value })}
                />
              </Field>

              {/* Position overrides */}
              {slot && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Field label="X override (%)">
                    <Input
                      type="number"
                      placeholder={String(slot.position_x)}
                      value={text.position_override_x ?? ''}
                      onChange={e =>
                        update(text.id, {
                          position_override_x: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Y override (%)">
                    <Input
                      type="number"
                      placeholder={String(slot.position_y)}
                      value={text.position_override_y ?? ''}
                      onChange={e =>
                        update(text.id, {
                          position_override_y: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={addText}>
          <Plus size={13} />
          Añadir texto
        </Button>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>Atrás</Button>
          <Button variant="primary" onClick={onNext}>
            Siguiente: Música
          </Button>
        </div>
      </div>
    </div>
  )
}
