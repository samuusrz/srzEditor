import { useEffect, useState } from 'react'
import { LayoutTemplate, Clock, Film, Check } from 'lucide-react'
import { getTemplates, getTemplateWithSlots } from '../../lib/db'
import type { Template, TemplateWithSlots } from '../../types'
import { EmptyState } from '../ui/EmptyState'

interface TemplatePickerProps {
  selected: TemplateWithSlots | null
  onSelect: (t: TemplateWithSlots) => void
}

export function TemplatePicker({ selected, onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => {
    getTemplates().then(setTemplates).catch(console.error).finally(() => setLoading(false))
  }, [])

  const pick = async (t: Template) => {
    setPicking(t.id)
    const full = await getTemplateWithSlots(t.id)
    onSelect(full)
    setPicking(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={<LayoutTemplate size={48} />}
        title="Sin plantillas"
        description="Crea una plantilla antes de editar un vídeo"
      />
    )
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Elige una plantilla</h2>
      <p className="text-zinc-500 text-sm mb-6">La plantilla define la estructura de slots, textos y timing de audio</p>
      <div className="flex flex-col gap-2">
        {templates.map(t => {
          const isSelected = selected?.id === t.id
          const isLoading = picking === t.id
          return (
            <button
              key={t.id}
              onClick={() => pick(t)}
              disabled={!!picking}
              className={`
                w-full text-left flex items-center gap-4 px-5 py-4 rounded-xl border transition-all cursor-pointer
                ${isSelected
                  ? 'bg-violet-900/20 border-violet-700'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }
              `}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-violet-800/50' : 'bg-zinc-800'}`}>
                {isLoading
                  ? <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  : isSelected
                  ? <Check size={18} className="text-violet-400" />
                  : <LayoutTemplate size={18} className="text-zinc-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-zinc-100 text-sm">{t.name}</p>
                {t.description && <p className="text-zinc-500 text-xs mt-0.5 truncate">{t.description}</p>}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-zinc-600 flex items-center gap-1">
                    <Clock size={10} />{t.total_duration}s
                  </span>
                  <span className="text-xs text-zinc-600 flex items-center gap-1">
                    <Film size={10} />{t.fps}fps
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
