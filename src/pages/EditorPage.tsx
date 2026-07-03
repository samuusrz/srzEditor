import { useState } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { useEditor } from '../hooks/useEditor'
import { MediaPanel }      from '../components/editor/MediaPanel'
import { PreviewPanel }    from '../components/editor/PreviewPanel'
import { PropertiesPanel } from '../components/editor/PropertiesPanel'
import { Timeline }        from '../components/editor/Timeline'
import { ExportModal }     from '../components/editor/ExportModal'
import type { AudioTrack } from '../types/editor'

interface Props {
  onBack: () => void
}

export function EditorPage({ onBack }: Props) {
  const [showExport, setShowExport] = useState(false)
  const {
    state, totalDuration,
    addClip, removeClip, moveClip, packClips,
    addText, updateText, removeText,
    setAudio, removeAudio,
    setPlayhead, setPlaying,
    setZoom, select,
  } = useEditor()

  const { clips, texts, audio, playhead, playing, zoom, selected } = state

  const updateAudio = (patch: Partial<AudioTrack>) => {
    if (!audio) return
    setAudio({ ...audio, ...patch })
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="h-12 flex-none flex items-center justify-between px-4 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} />
            Salir
          </button>
          <span className="text-zinc-700">|</span>
          <span className="text-sm font-semibold text-zinc-200">SRZ Editor</span>
        </div>

        <button
          onClick={() => setShowExport(true)}
          disabled={clips.length === 0}
          className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          <Download size={13} />
          Exportar
        </button>
      </header>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: media & tools */}
        <MediaPanel
          clips={clips}
          texts={texts}
          audio={audio}
          totalDuration={totalDuration}
          onAddClip={addClip}
          onRemoveClip={removeClip}
          onAddText={addText}
          onSetAudio={setAudio}
          onRemoveAudio={removeAudio}
        />

        {/* Center: video preview */}
        <PreviewPanel
          clips={clips}
          texts={texts}
          playhead={playhead}
          playing={playing}
          totalDuration={totalDuration}
          onSetPlayhead={setPlayhead}
          onSetPlaying={setPlaying}
        />

        {/* Right: properties */}
        <PropertiesPanel
          selected={selected}
          clips={clips}
          texts={texts}
          audio={audio}
          totalDuration={totalDuration}
          onUpdateText={updateText}
          onRemoveText={removeText}
          onUpdateAudio={updateAudio}
          onRemoveAudio={removeAudio}
          onRemoveClip={removeClip}
        />
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <Timeline
        clips={clips}
        texts={texts}
        audio={audio}
        playhead={playhead}
        playing={playing}
        totalDuration={totalDuration}
        zoom={zoom}
        selected={selected}
        onSetPlayhead={setPlayhead}
        onSetPlaying={setPlaying}
        onMoveClip={moveClip}
        onPackClips={packClips}
        onSelect={select}
        onSetZoom={setZoom}
      />

      {/* ── Export modal ───────────────────────────────────────────────────── */}
      {showExport && (
        <ExportModal
          clips={clips}
          texts={texts}
          audio={audio}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
