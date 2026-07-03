import { useState } from 'react'
import { ChevronRight, Upload, Check, Film, Type, Music, Eye } from 'lucide-react'
import { TemplatePicker } from '../components/editor/TemplatePicker'
import { ClipsStep } from '../components/editor/ClipsStep'
import { TextsStep } from '../components/editor/TextsStep'
import { AudioStep } from '../components/editor/AudioStep'
import { PreviewExportStep } from '../components/editor/PreviewExportStep'
import type { TemplateWithSlots, ProjectClip, ProjectText, SongLibraryItem } from '../types'

type Step = 'template' | 'clips' | 'texts' | 'audio' | 'export'

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: 'template', label: 'Plantilla', icon: <Film size={14} /> },
  { id: 'clips', label: 'Clips', icon: <Upload size={14} /> },
  { id: 'texts', label: 'Textos', icon: <Type size={14} /> },
  { id: 'audio', label: 'Música', icon: <Music size={14} /> },
  { id: 'export', label: 'Exportar', icon: <Eye size={14} /> },
]

export function EditorPage() {
  const [step, setStep] = useState<Step>('template')
  const [template, setTemplate] = useState<TemplateWithSlots | null>(null)
  const [clips, setClips] = useState<ProjectClip[]>([])
  const [texts, setTexts] = useState<ProjectText[]>([])
  const [audio, setAudio] = useState<{ song: SongLibraryItem; startAt: number } | null>(null)

  const currentIdx = STEPS.findIndex(s => s.id === step)

  const canGoToStep = (id: Step) => {
    const idx = STEPS.findIndex(s => s.id === id)
    if (idx === 0) return true
    if (idx >= 1 && !template) return false
    return true
  }

  const resetProject = () => {
    setTemplate(null)
    setClips([])
    setTexts([])
    setAudio(null)
    setStep('template')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Step nav */}
      <div className="border-b border-zinc-800 px-8 py-0">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const active = s.id === step
            const done = currentIdx > i
            const accessible = canGoToStep(s.id)
            return (
              <button
                key={s.id}
                onClick={() => accessible && setStep(s.id)}
                disabled={!accessible}
                className={`
                  flex items-center gap-2 px-4 py-4 text-sm border-b-2 transition-colors cursor-pointer
                  disabled:cursor-not-allowed
                  ${active
                    ? 'border-violet-500 text-violet-400'
                    : done
                    ? 'border-transparent text-zinc-400 hover:text-zinc-200'
                    : 'border-transparent text-zinc-600 hover:text-zinc-400'
                  }
                `}
              >
                {done && !active ? <Check size={13} className="text-green-400" /> : s.icon}
                {s.label}
                {i < STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-zinc-700 ml-1" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-auto p-8">
        {step === 'template' && (
          <TemplatePicker
            selected={template}
            onSelect={t => { setTemplate(t); setClips([]); setStep('clips') }}
          />
        )}

        {step === 'clips' && template && (
          <ClipsStep
            template={template}
            clips={clips}
            onChange={setClips}
            onNext={() => setStep('texts')}
          />
        )}

        {step === 'texts' && template && (
          <TextsStep
            template={template}
            texts={texts}
            onChange={setTexts}
            onNext={() => setStep('audio')}
            onBack={() => setStep('clips')}
          />
        )}

        {step === 'audio' && template && (
          <AudioStep
            template={template}
            audio={audio}
            onChange={setAudio}
            onNext={() => setStep('export')}
            onBack={() => setStep('texts')}
          />
        )}

        {step === 'export' && template && (
          <PreviewExportStep
            template={template}
            clips={clips}
            texts={texts}
            audio={audio}
            onBack={() => setStep('audio')}
            onReset={resetProject}
          />
        )}
      </div>
    </div>
  )
}
