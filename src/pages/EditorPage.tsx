import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Download, Undo2, Redo2, Check } from 'lucide-react'
import { useEditor } from '../hooks/useEditor'
import { saveProject, editorStateToProject } from '../lib/projectStorage'
import type { Clip, TextOverlay, EditorState } from '../types/editor'
import { MediaPanel }      from '../components/editor/MediaPanel'
import { PreviewPanel }    from '../components/editor/PreviewPanel'
import { PropertiesPanel } from '../components/editor/PropertiesPanel'
import { Timeline }        from '../components/editor/Timeline'
import { ExportModal }     from '../components/editor/ExportModal'

interface Props {
  onBack: () => void
  projectId: string
  initialEditorState?: EditorState
}

export function EditorPage({ onBack, projectId, initialEditorState }: Props) {
  const [showExport, setShowExport] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Clipboard ──────────────────────────────────────────────────────────
  const [clipboard, setClipboard] = useState<{
    clips: Clip[]
    texts: TextOverlay[]
    anchor: number
  } | null>(null)

  const {
    state, totalDuration,
    canUndo, canRedo, undo, redo, snapshot,
    addClip, removeClip, resolveClipConflicts, moveClip, trimClip, splitClip,
    setClipVolume, toggleClipMute, extractAudio,
    addText, updateText, dragTextPos, removeText, splitText, moveText, trimText, resolveTextConflicts, moveMulti, removeMulti,
    setAudio, updateAudio, dragAudioPos, dragAudioKf, trimAudio, removeAudio,
    setPlayhead, setPlaying, setZoom, select,
  } = useEditor(initialEditorState)

  const [previewUntil, setPreviewUntil] = useState<number | null>(null)
  const previewElRef = useRef<HTMLDivElement | null>(null)

  const handlePreviewClip = useCallback((clip: Clip) => {
    setPlayhead(clip.startAt)
    setPlaying(true)
    setPreviewUntil(clip.startAt + clip.duration)
  }, [setPlayhead, setPlaying])

  const handleClearPreview = useCallback(() => setPreviewUntil(null), [])

  const { clips, texts, audio, playhead, playing, zoom, selected } = state

  // ── Auto-save ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (clips.length === 0 && texts.length === 0 && !audio) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveProject(editorStateToProject(state, projectId))
        .then(() => {
          setSaved(true)
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
          savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
        })
        .catch(console.error)
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [clips, texts, audio, zoom, projectId])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA'

      // ── Copy ──────────────────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'c') {
        if (isInput) return // allow normal text copy in inputs
        e.preventDefault()
        if (selected?.type === 'clip') {
          const c = clips.find(x => x.id === selected.id)
          if (c) setClipboard({ clips: [c], texts: [], anchor: c.startAt })
        } else if (selected?.type === 'text') {
          const t = texts.find(x => x.id === selected.id)
          if (t) setClipboard({ clips: [], texts: [t], anchor: t.startAt })
        } else if (selected?.type === 'multi') {
          const selClips = clips.filter(c => selected.clipIds.includes(c.id))
          const selTexts = texts.filter(t => selected.textIds.includes(t.id))
          const starts = [...selClips.map(c => c.startAt), ...selTexts.map(t => t.startAt)]
          setClipboard({ clips: selClips, texts: selTexts, anchor: starts.length ? Math.min(...starts) : playhead })
        }
        return
      }

      // ── Cut ───────────────────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        if (isInput) return
        e.preventDefault()
        if (selected?.type === 'clip') {
          const c = clips.find(x => x.id === selected.id)
          if (c) { setClipboard({ clips: [c], texts: [], anchor: c.startAt }); removeClip(c.id) }
        } else if (selected?.type === 'text') {
          const t = texts.find(x => x.id === selected.id)
          if (t) { setClipboard({ clips: [], texts: [t], anchor: t.startAt }); removeText(t.id) }
        } else if (selected?.type === 'multi') {
          const selClips = clips.filter(c => selected.clipIds.includes(c.id))
          const selTexts = texts.filter(t => selected.textIds.includes(t.id))
          const starts = [...selClips.map(c => c.startAt), ...selTexts.map(t => t.startAt)]
          setClipboard({ clips: selClips, texts: selTexts, anchor: starts.length ? Math.min(...starts) : playhead })
          removeMulti(selected.clipIds, selected.textIds)
        }
        return
      }

      // ── Paste ─────────────────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (isInput) return
        e.preventDefault()
        if (!clipboard) return
        const offset = playhead - clipboard.anchor
        clipboard.clips.forEach(c => addClip({ ...c, id: crypto.randomUUID(), startAt: Math.max(0, c.startAt + offset) }))
        clipboard.texts.forEach(t => addText({ ...t, id: crypto.randomUUID(), startAt: Math.max(0, t.startAt + offset) }))
        return
      }

      if (isInput) return

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selected?.type === 'clip')  removeClip(selected.id)
        if (selected?.type === 'text')  removeText(selected.id)
        if (selected?.type === 'audio') removeAudio()
        if (selected?.type === 'multi') removeMulti(selected.clipIds, selected.textIds)
      }
      if (e.key === 'c' || e.key === 'C') {
        if (selected?.type === 'text') {
          const text = texts.find(t => t.id === selected.id)
          if (text && playhead > text.startAt && playhead < text.startAt + text.duration) {
            splitText(text.id, playhead)
          }
        } else {
          const clipAtPlayhead = clips.find(c => c.startAt <= playhead && playhead < c.startAt + c.duration)
          if (clipAtPlayhead) splitClip(clipAtPlayhead.id, playhead)
        }
      }
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing) }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); previewElRef.current?.requestFullscreen?.() }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, playing, clips, texts, playhead, clipboard, undo, redo, addClip, addText, removeClip, removeText, splitText, removeAudio, removeMulti, setPlaying, splitClip])

  const handleAddText = () => {
    addText({
      id: crypto.randomUUID(),
      content: 'Texto',
      startAt: Math.max(0, playhead),
      duration: Math.max(3, totalDuration > 0 ? totalDuration : 3),
      x: 50, y: 15, track: 0,
      fontSize: 72,
      color: '#ffffff',
      bold: true,
    })
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      {/* Top bar */}
      <header className="h-12 flex-none flex items-center justify-between px-4 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer">
            <ArrowLeft size={15} />
            Salir
          </button>
          <span className="text-zinc-700">|</span>
          <span className="text-sm font-semibold text-zinc-200">SRZ Editor</span>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 ml-2">
              <Check size={11} /> Guardado
            </span>
          )}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo} disabled={!canUndo}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Deshacer (Ctrl+Z)"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={redo} disabled={!canRedo}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Rehacer (Ctrl+Y)"
          >
            <Redo2 size={15} />
          </button>
        </div>

        <button
          onClick={() => setShowExport(true)} disabled={clips.length === 0}
          className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          <Download size={13} />
          Exportar
        </button>
      </header>

      {/* Main */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <MediaPanel
          clips={clips} texts={texts} audio={audio} totalDuration={totalDuration}
          onAddClip={addClip} onRemoveClip={removeClip}
          onAddText={handleAddText}
          onSetAudio={setAudio} onRemoveAudio={removeAudio}
        />
        <PreviewPanel
          clips={clips} texts={texts} audio={audio}
          playhead={playhead} playing={playing} totalDuration={totalDuration}
          selected={selected} previewUntil={previewUntil}
          onSetPlayhead={setPlayhead} onSetPlaying={setPlaying}
          onUpdateText={updateText} onDragTextPos={dragTextPos}
          onSelect={select} onSnapshot={snapshot} onClearPreview={handleClearPreview}
          previewElRef={previewElRef}
        />
        <PropertiesPanel
          selected={selected} clips={clips} texts={texts} audio={audio} totalDuration={totalDuration}
          onUpdateText={updateText} onRemoveText={removeText}
          onUpdateAudio={updateAudio} onRemoveAudio={removeAudio}
          onRemoveClip={removeClip} onSetClipVolume={setClipVolume} onToggleClipMute={toggleClipMute}
        />
      </div>

      {/* Timeline */}
      <Timeline
        clips={clips} texts={texts} audio={audio}
        playhead={playhead} totalDuration={totalDuration} zoom={zoom} selected={selected}
        onSetPlayhead={setPlayhead}
        onMoveClip={moveClip} onTrimClip={trimClip} onSplitClip={splitClip}
        onResolveConflicts={resolveClipConflicts}
        onToggleMute={toggleClipMute} onExtractAudio={extractAudio}
        onMoveText={moveText} onTrimText={trimText} onResolveTextConflicts={resolveTextConflicts}
        onMoveAudio={updateAudio}
        onDragAudioPos={dragAudioPos} onDragAudioKf={dragAudioKf} onTrimAudio={trimAudio}
        onMoveMulti={moveMulti}
        onSelect={select} onSetZoom={setZoom} onSnapshot={snapshot}
        onPreviewClip={handlePreviewClip}
      />

      {showExport && (
        <ExportModal clips={clips} texts={texts} audio={audio} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
