import { useEffect, useState, useRef } from 'react'
import { Film, Plus, Clapperboard, Pencil, Trash2, Check, X } from 'lucide-react'
import { listProjects, loadProject, hydrateEditorState, deleteProject, renameProject, type EditorProject } from '../lib/projectStorage'
import type { EditorState } from '../types/editor'

interface DashboardPageProps {
  onNewEditor: () => void
  onOpenProject: (id: string, state: EditorState) => void
}

export function DashboardPage({ onNewEditor, onOpenProject }: DashboardPageProps) {
  const [editorProjects, setEditorProjects] = useState<EditorProject[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const refreshEditorProjects = () =>
    listProjects().then(ps => setEditorProjects(ps)).catch(console.error)

  useEffect(() => { refreshEditorProjects() }, [])

  const handleOpenEditorProject = async (p: EditorProject) => {
    if (editingId) return
    const proj = await loadProject(p.id).catch(() => null)
    if (!proj) return
    onOpenProject(proj.id, hydrateEditorState(proj.state))
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteProject(id).catch(console.error)
    refreshEditorProjects()
  }

  const handleStartEdit = (e: React.MouseEvent, p: EditorProject) => {
    e.stopPropagation()
    setEditingId(p.id)
    setEditingName(p.name)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const handleConfirmEdit = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!editingId || !editingName.trim()) { setEditingId(null); return }
    await renameProject(editingId, editingName.trim()).catch(console.error)
    setEditingId(null)
    refreshEditorProjects()
  }

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingId(null)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Monta vídeos de dropshipping orgánico en minutos.</p>
      </div>

      {/* Quick action */}
      <div className="mb-10">
        <button
          onClick={onNewEditor}
          className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left hover:border-violet-700 hover:bg-zinc-800/60 transition-all cursor-pointer w-64"
        >
          <div className="w-10 h-10 bg-violet-900/40 rounded-lg flex items-center justify-center mb-3 group-hover:bg-violet-800/50 transition-colors">
            <Film size={20} className="text-violet-400" />
          </div>
          <p className="font-semibold text-zinc-100 text-sm">Nuevo vídeo</p>
          <p className="text-zinc-500 text-xs mt-0.5">Sube clips, añade texto y exporta</p>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        {[
          { label: 'Ediciones', value: editorProjects.length, icon: <Film size={16} /> },
          { label: 'Exportados', value: editorProjects.filter(p => p.thumbnail).length, icon: <Clapperboard size={16} /> },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
              {s.icon}{s.label}
            </div>
            <p className="text-2xl font-bold text-zinc-100">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Recent editor projects */}
      {editorProjects.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Ediciones recientes</h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {editorProjects.map(p => (
              <div
                key={p.id}
                onClick={() => handleOpenEditorProject(p)}
                className="group flex-none w-32 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden text-left hover:border-violet-700 transition-all cursor-pointer relative"
              >
                {/* Action buttons */}
                <div
                  className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={e => handleStartEdit(e, p)}
                    className="w-6 h-6 rounded-md bg-zinc-900/80 backdrop-blur flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
                    title="Renombrar"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={e => handleDelete(e, p.id)}
                    className="w-6 h-6 rounded-md bg-zinc-900/80 backdrop-blur flex items-center justify-center text-zinc-300 hover:text-red-400 hover:bg-zinc-700 transition-colors cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* 9:16 thumbnail */}
                <div className="bg-zinc-800 relative overflow-hidden w-full" style={{ aspectRatio: '9/16' }}>
                  {p.thumbnail
                    ? <img src={p.thumbnail} className="w-full h-full object-cover" alt="" />
                    : <div className="absolute inset-0 flex items-center justify-center text-zinc-600"><Film size={22} /></div>
                  }
                </div>

                <div className="p-2">
                  {editingId === p.id ? (
                    <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        ref={editInputRef}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleConfirmEdit(); if (e.key === 'Escape') handleCancelEdit() }}
                        className="w-full bg-zinc-800 border border-violet-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 focus:outline-none"
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <button onClick={handleConfirmEdit} className="flex-1 flex items-center justify-center gap-0.5 text-[10px] text-emerald-400 hover:text-emerald-300 cursor-pointer"><Check size={10} />OK</button>
                        <button onClick={handleCancelEdit} className="flex-1 flex items-center justify-center gap-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"><X size={10} />Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-zinc-200 truncate">{p.name}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {new Date(p.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-400 text-sm">No hay ediciones todavía</p>
          <button
            onClick={onNewEditor}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={14} />Nuevo vídeo
          </button>
        </div>
      )}
    </div>
  )
}
