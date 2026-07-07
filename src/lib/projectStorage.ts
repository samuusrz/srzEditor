import type { Clip, TextOverlay, AudioTrack, EditorState } from '../types/editor'

// ── Types ─────────────────────────────────────────────────────────────────────

export type StoredClip = Omit<Clip, 'localUrl'>
export type StoredAudioTrack = Omit<AudioTrack, 'localUrl'>

export interface StoredEditorState {
  clips: StoredClip[]
  texts: TextOverlay[]
  audio: StoredAudioTrack | null
  zoom: number
}

export interface EditorProject {
  id: string
  name: string
  updatedAt: number
  thumbnail: string
  state: StoredEditorState
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('srz-editor', 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('projects', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => { dbPromise = null; reject(req.error) }
    })
  }
  return dbPromise
}

function idbOp<T>(fn: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = 'readonly'): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const tx  = db.transaction('projects', mode)
    const req = fn(tx.objectStore('projects'))
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  }))
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function saveProject(project: EditorProject): Promise<void> {
  await idbOp(store => store.put(project), 'readwrite')
}

export async function loadProject(id: string): Promise<EditorProject | null> {
  const result = await idbOp<EditorProject | undefined>(store => store.get(id))
  return result ?? null
}

export async function listProjects(): Promise<EditorProject[]> {
  const all = await idbOp<EditorProject[]>(store => store.getAll())
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteProject(id: string): Promise<void> {
  await idbOp(store => store.delete(id), 'readwrite')
}

// ── Serialisation helpers ─────────────────────────────────────────────────────

export function editorStateToProject(state: EditorState, projectId: string): EditorProject {
  const name      = state.clips[0]?.name ?? state.texts[0]?.content ?? 'Proyecto sin nombre'
  const thumbnail = state.clips[0]?.thumbnail ?? ''

  const stored: StoredEditorState = {
    clips: state.clips.map(({ localUrl: _url, ...c }) => c),
    texts: state.texts,
    audio: state.audio ? (({ localUrl: _url, ...a }) => a)(state.audio) : null,
    zoom:  state.zoom,
  }

  return { id: projectId, name, updatedAt: Date.now(), thumbnail, state: stored }
}

export function hydrateEditorState(stored: StoredEditorState): EditorState {
  return {
    clips:    stored.clips.map(c  => ({ ...c, localUrl: URL.createObjectURL(c.file) })),
    texts:    stored.texts.map(t  => ({ ...t, track: (t as any).track ?? 0 })),
    audio:    stored.audio ? {
      ...stored.audio,
      localUrl: URL.createObjectURL(stored.audio.file),
      originalDuration: (stored.audio as any).originalDuration ?? stored.audio.duration,
    } : null,
    zoom:     stored.zoom,
    playhead: 0,
    playing:  false,
    selected: null,
  }
}
