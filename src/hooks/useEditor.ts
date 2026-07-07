import { useReducer, useCallback } from 'react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem, EditorState, VolumeKeyframe } from '../types/editor'

// ── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_CLIP'; clip: Clip }
  | { type: 'REMOVE_CLIP'; id: string }
  | { type: 'MOVE_CLIP'; id: string; startAt: number; track?: number }  // drag (not undoable)
  | { type: 'TRIM_CLIP'; id: string; trimStart: number; duration: number; startAt: number } // drag
  | { type: 'RESOLVE_CONFLICTS'; winnerId: string }             // resolve track overlaps after drag
  | { type: 'SPLIT_CLIP'; clipId: string; at: number }
  | { type: 'SET_CLIP_VOLUME'; id: string; volume: number }
  | { type: 'TOGGLE_CLIP_MUTE'; id: string }
  | { type: 'EXTRACT_AUDIO'; clipId: string }
  | { type: 'ADD_TEXT'; text: TextOverlay }
  | { type: 'UPDATE_TEXT'; id: string; patch: Partial<TextOverlay> }  // undoable
  | { type: 'DRAG_TEXT_POS'; id: string; x: number; y: number }       // drag (not undoable)
  | { type: 'SPLIT_TEXT'; textId: string; at: number }
  | { type: 'REMOVE_TEXT'; id: string }
  | { type: 'MOVE_TEXT'; id: string; startAt: number; track?: number }   // drag (not undoable)
  | { type: 'TRIM_TEXT'; id: string; startAt: number; duration: number } // drag (not undoable)
  | { type: 'RESOLVE_TEXT_CONFLICTS'; winnerId: string }                  // resolve text overlaps
  | { type: 'MOVE_MULTI'; clips: Array<{ id: string; startAt: number }>; texts: Array<{ id: string; startAt: number }> }  // multi drag (not undoable)
  | { type: 'REMOVE_MULTI'; clipIds: string[]; textIds: string[] }     // undoable
  | { type: 'SET_AUDIO'; audio: AudioTrack }
  | { type: 'UPDATE_AUDIO'; patch: Partial<AudioTrack> }        // undoable (property panel)
  | { type: 'DRAG_AUDIO_POS'; startAt: number }                 // drag (not undoable)
  | { type: 'DRAG_AUDIO_KF'; keyframes: VolumeKeyframe[] }      // drag (not undoable)
  | { type: 'TRIM_AUDIO'; startAt: number; duration: number }   // drag (not undoable)
  | { type: 'REMOVE_AUDIO' }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SELECT'; item: SelectedItem }

// Only these actions are saved to the undo history
const UNDOABLE = new Set([
  'ADD_CLIP', 'REMOVE_CLIP', 'SPLIT_CLIP', 'RESOLVE_CONFLICTS',
  'SET_CLIP_VOLUME', 'TOGGLE_CLIP_MUTE', 'EXTRACT_AUDIO',
  'ADD_TEXT', 'UPDATE_TEXT', 'SPLIT_TEXT', 'REMOVE_TEXT', 'REMOVE_MULTI',
  'SET_AUDIO', 'UPDATE_AUDIO', 'REMOVE_AUDIO',
])

// ── Core reducer ─────────────────────────────────────────────────────────────

const editorInit: EditorState = {
  clips: [], texts: [], audio: null,
  playhead: 0, playing: false, zoom: 100, selected: null,
}

function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'ADD_CLIP': {
      const end = state.clips.reduce((m, c) => Math.max(m, c.startAt + c.duration), 0)
      return { ...state, clips: [...state.clips, { ...action.clip, startAt: end, track: 0 }] }
    }
    case 'RESOLVE_CONFLICTS': {
      // Winner clip keeps its track; any same-track clip that overlaps it moves to next free track
      const winner = state.clips.find(c => c.id === action.winnerId)
      if (!winner) return state
      let clips = state.clips
      const wt = winner.track ?? 0
      const conflicts = clips.filter(c =>
        c.id !== winner.id &&
        (c.track ?? 0) === wt &&
        c.startAt < winner.startAt + winner.duration &&
        c.startAt + c.duration > winner.startAt
      )
      for (const conflict of conflicts) {
        // Find lowest track > wt with no overlap for this clip
        let newTrack = wt + 1
        while (true) {
          const occupied = clips.filter(c => c.id !== conflict.id && c.track === newTrack)
          const hasOverlap = occupied.some(c =>
            c.startAt < conflict.startAt + conflict.duration && c.startAt + c.duration > conflict.startAt
          )
          if (!hasOverlap) break
          newTrack++
        }
        clips = clips.map(c => c.id === conflict.id ? { ...c, track: newTrack } : c)
      }
      return { ...state, clips }
    }
    case 'REMOVE_CLIP':
      return { ...state, clips: state.clips.filter(c => c.id !== action.id), selected: null }
    case 'MOVE_CLIP':
      return { ...state, clips: state.clips.map(c => c.id === action.id ? { ...c, startAt: Math.max(0, action.startAt), ...(action.track !== undefined && { track: action.track }) } : c) }
    case 'TRIM_CLIP':
      return { ...state, clips: state.clips.map(c => c.id === action.id ? { ...c, trimStart: action.trimStart, duration: action.duration, startAt: action.startAt } : c) }
    case 'SPLIT_CLIP': {
      const clip = state.clips.find(c => c.id === action.clipId)
      if (!clip) return state
      const offset = action.at - clip.startAt
      if (offset <= 0.05 || offset >= clip.duration - 0.05) return state
      const c1: Clip = { ...clip, duration: offset }
      const c2: Clip = { ...clip, id: crypto.randomUUID(), startAt: action.at, trimStart: clip.trimStart + offset, duration: clip.duration - offset }
      const clips: Clip[] = []
      for (const c of state.clips) { clips.push(c.id === action.clipId ? c1 : c); if (c.id === action.clipId) clips.push(c2) }
      return { ...state, clips, selected: { type: 'clip', id: c2.id } }
    }
    case 'SET_CLIP_VOLUME':
      return { ...state, clips: state.clips.map(c => c.id === action.id ? { ...c, volume: action.volume } : c) }
    case 'TOGGLE_CLIP_MUTE':
      return { ...state, clips: state.clips.map(c => c.id === action.id ? { ...c, muted: !c.muted } : c) }
    case 'EXTRACT_AUDIO': {
      const clip = state.clips.find(c => c.id === action.clipId)
      if (!clip) return state
      const audio: AudioTrack = {
        id: crypto.randomUUID(), file: clip.file, localUrl: clip.localUrl,
        name: `Audio · ${clip.name}`, startAt: clip.startAt, duration: clip.originalDuration,
        originalDuration: clip.originalDuration,
        volume: 1, fadeIn: 0, fadeOut: 0, keyframes: [],
      }
      return { ...state, audio, clips: state.clips.map(c => c.id === action.clipId ? { ...c, muted: true } : c) }
    }
    case 'ADD_TEXT':
      return { ...state, texts: [...state.texts, action.text], selected: { type: 'text', id: action.text.id } }
    case 'UPDATE_TEXT':
      return { ...state, texts: state.texts.map(t => t.id === action.id ? { ...t, ...action.patch } : t) }
    case 'DRAG_TEXT_POS':
      return { ...state, texts: state.texts.map(t => t.id === action.id ? { ...t, x: action.x, y: action.y } : t) }
    case 'SPLIT_TEXT': {
      const text = state.texts.find(t => t.id === action.textId)
      if (!text) return state
      const offset = action.at - text.startAt
      if (offset <= 0.05 || offset >= text.duration - 0.05) return state
      const t1: TextOverlay = { ...text, duration: offset }
      const t2: TextOverlay = { ...text, id: crypto.randomUUID(), startAt: action.at, duration: text.duration - offset, track: text.track ?? 0 }
      const texts: TextOverlay[] = []
      for (const t of state.texts) { texts.push(t.id === action.textId ? t1 : t); if (t.id === action.textId) texts.push(t2) }
      return { ...state, texts, selected: { type: 'text', id: t2.id } }
    }
    case 'REMOVE_TEXT':
      return { ...state, texts: state.texts.filter(t => t.id !== action.id), selected: null }
    case 'MOVE_TEXT':
      return { ...state, texts: state.texts.map(t => t.id === action.id ? { ...t, startAt: Math.max(0, action.startAt), ...(action.track !== undefined && { track: action.track }) } : t) }
    case 'TRIM_TEXT':
      return { ...state, texts: state.texts.map(t => t.id === action.id ? { ...t, startAt: Math.max(0, action.startAt), duration: Math.max(0.1, action.duration) } : t) }
    case 'RESOLVE_TEXT_CONFLICTS': {
      const winner = state.texts.find(t => t.id === action.winnerId)
      if (!winner) return state
      let texts = state.texts
      const wt = winner.track ?? 0
      const conflicts = texts.filter(t =>
        t.id !== winner.id && (t.track ?? 0) === wt &&
        t.startAt < winner.startAt + winner.duration && t.startAt + t.duration > winner.startAt
      )
      for (const conflict of conflicts) {
        let newTrack = wt + 1
        while (true) {
          const occupied = texts.filter(t => t.id !== conflict.id && (t.track ?? 0) === newTrack)
          const hasOverlap = occupied.some(t => t.startAt < conflict.startAt + conflict.duration && t.startAt + t.duration > conflict.startAt)
          if (!hasOverlap) break
          newTrack++
        }
        texts = texts.map(t => t.id === conflict.id ? { ...t, track: newTrack } : t)
      }
      return { ...state, texts }
    }
    case 'MOVE_MULTI': {
      let clips = state.clips
      let texts = state.texts
      for (const m of action.clips) clips = clips.map(c => c.id === m.id ? { ...c, startAt: Math.max(0, m.startAt) } : c)
      for (const m of action.texts) texts = texts.map(t => t.id === m.id ? { ...t, startAt: Math.max(0, m.startAt) } : t)
      return { ...state, clips, texts }
    }
    case 'REMOVE_MULTI':
      return { ...state, clips: state.clips.filter(c => !action.clipIds.includes(c.id)), texts: state.texts.filter(t => !action.textIds.includes(t.id)), selected: null }
    case 'SET_AUDIO':
      return { ...state, audio: action.audio }
    case 'UPDATE_AUDIO':
      return { ...state, audio: state.audio ? { ...state.audio, ...action.patch } : null }
    case 'DRAG_AUDIO_POS': {
      if (!state.audio) return state
      const newStart = Math.max(0, action.startAt)
      const delta = newStart - state.audio.startAt
      const keyframes = state.audio.keyframes.map(kf => ({ ...kf, time: kf.time + delta }))
      return { ...state, audio: { ...state.audio, startAt: newStart, keyframes } }
    }
    case 'DRAG_AUDIO_KF':
      return { ...state, audio: state.audio ? { ...state.audio, keyframes: action.keyframes } : null }
    case 'TRIM_AUDIO':
      return { ...state, audio: state.audio ? { ...state.audio, startAt: Math.max(0, action.startAt), duration: Math.max(0.1, action.duration) } : null }
    case 'REMOVE_AUDIO':
      return { ...state, audio: null, selected: null }
    case 'SET_PLAYHEAD':
      return { ...state, playhead: Math.max(0, action.time) }
    case 'SET_PLAYING':
      return { ...state, playing: action.playing }
    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(40, Math.min(400, action.zoom)) }
    case 'SELECT':
      return { ...state, selected: action.item }
    default:
      return state
  }
}

// ── History wrapper ───────────────────────────────────────────────────────────

interface History {
  past: EditorState[]
  present: EditorState
  future: EditorState[]
}

type HistoryAction = Action | { type: 'UNDO' } | { type: 'REDO' } | { type: 'SNAPSHOT' }

const MAX_HISTORY = 60

function pushHistory(hist: History, newPresent: EditorState): History {
  return {
    past: [...hist.past.slice(-(MAX_HISTORY - 1)), hist.present],
    present: newPresent,
    future: [],
  }
}

function historyReducer(hist: History, action: HistoryAction): History {
  // Undo / Redo
  if (action.type === 'UNDO') {
    if (!hist.past.length) return hist
    return {
      past: hist.past.slice(0, -1),
      present: hist.past[hist.past.length - 1],
      future: [hist.present, ...hist.future.slice(0, MAX_HISTORY - 1)],
    }
  }
  if (action.type === 'REDO') {
    if (!hist.future.length) return hist
    return {
      past: [...hist.past.slice(-(MAX_HISTORY - 1)), hist.present],
      present: hist.future[0],
      future: hist.future.slice(1),
    }
  }

  // Snapshot: save current state to undo history without modifying it
  // (called on mouseUp after a drag)
  if (action.type === 'SNAPSHOT') {
    const last = hist.past[hist.past.length - 1]
    if (last === hist.present) return hist  // nothing changed since last snapshot
    return {
      past: [...hist.past.slice(-(MAX_HISTORY - 1)), hist.present],
      present: hist.present,
      future: [],
    }
  }

  // Normal action
  const newPresent = editorReducer(hist.present, action as Action)
  if (newPresent === hist.present) return hist

  if (UNDOABLE.has(action.type)) {
    return pushHistory(hist, newPresent)
  }
  // Non-undoable: update present only, keep past/future
  return { ...hist, present: newPresent }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEditor(initialState?: EditorState) {
  const [hist, dispatch] = useReducer(
    historyReducer,
    initialState,
    (init): History => ({ past: [], present: init ?? editorInit, future: [] }),
  )
  const state = hist.present
  const totalDuration = state.clips.reduce((m, c) => Math.max(m, c.startAt + c.duration), 0)

  return {
    state,
    totalDuration,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    undo:           useCallback(() => dispatch({ type: 'UNDO' }), []),
    redo:           useCallback(() => dispatch({ type: 'REDO' }), []),
    snapshot:       useCallback(() => dispatch({ type: 'SNAPSHOT' }), []),
    addClip:               useCallback((clip: Clip) => dispatch({ type: 'ADD_CLIP', clip }), []),
    removeClip:            useCallback((id: string) => dispatch({ type: 'REMOVE_CLIP', id }), []),
    resolveClipConflicts:  useCallback((winnerId: string) => dispatch({ type: 'RESOLVE_CONFLICTS', winnerId }), []),
    moveClip:              useCallback((id: string, startAt: number, track?: number) => dispatch({ type: 'MOVE_CLIP', id, startAt, track }), []),
    trimClip:       useCallback((id: string, trimStart: number, duration: number, startAt: number) => dispatch({ type: 'TRIM_CLIP', id, trimStart, duration, startAt }), []),
    splitClip:      useCallback((clipId: string, at: number) => dispatch({ type: 'SPLIT_CLIP', clipId, at }), []),
    setClipVolume:  useCallback((id: string, volume: number) => dispatch({ type: 'SET_CLIP_VOLUME', id, volume }), []),
    toggleClipMute: useCallback((id: string) => dispatch({ type: 'TOGGLE_CLIP_MUTE', id }), []),
    extractAudio:   useCallback((clipId: string) => dispatch({ type: 'EXTRACT_AUDIO', clipId }), []),
    addText:        useCallback((text: TextOverlay) => dispatch({ type: 'ADD_TEXT', text }), []),
    updateText:     useCallback((id: string, patch: Partial<TextOverlay>) => dispatch({ type: 'UPDATE_TEXT', id, patch }), []),
    dragTextPos:    useCallback((id: string, x: number, y: number) => dispatch({ type: 'DRAG_TEXT_POS', id, x, y }), []),
    splitText:      useCallback((textId: string, at: number) => dispatch({ type: 'SPLIT_TEXT', textId, at }), []),
    removeText:     useCallback((id: string) => dispatch({ type: 'REMOVE_TEXT', id }), []),
    moveText:       useCallback((id: string, startAt: number, track?: number) => dispatch({ type: 'MOVE_TEXT', id, startAt, track }), []),
    trimText:       useCallback((id: string, startAt: number, duration: number) => dispatch({ type: 'TRIM_TEXT', id, startAt, duration }), []),
    resolveTextConflicts: useCallback((winnerId: string) => dispatch({ type: 'RESOLVE_TEXT_CONFLICTS', winnerId }), []),
    trimAudio:      useCallback((startAt: number, duration: number) => dispatch({ type: 'TRIM_AUDIO', startAt, duration }), []),
    moveMulti:      useCallback((clips: Array<{id:string;startAt:number}>, texts: Array<{id:string;startAt:number}>) => dispatch({ type: 'MOVE_MULTI', clips, texts }), []),
    removeMulti:    useCallback((clipIds: string[], textIds: string[]) => dispatch({ type: 'REMOVE_MULTI', clipIds, textIds }), []),
    setAudio:       useCallback((audio: AudioTrack) => dispatch({ type: 'SET_AUDIO', audio }), []),
    updateAudio:    useCallback((patch: Partial<AudioTrack>) => dispatch({ type: 'UPDATE_AUDIO', patch }), []),
    dragAudioPos:   useCallback((startAt: number) => dispatch({ type: 'DRAG_AUDIO_POS', startAt }), []),
    dragAudioKf:    useCallback((keyframes: VolumeKeyframe[]) => dispatch({ type: 'DRAG_AUDIO_KF', keyframes }), []),
    removeAudio:    useCallback(() => dispatch({ type: 'REMOVE_AUDIO' }), []),
    setPlayhead:    useCallback((time: number) => dispatch({ type: 'SET_PLAYHEAD', time }), []),
    setPlaying:     useCallback((playing: boolean) => dispatch({ type: 'SET_PLAYING', playing }), []),
    setZoom:        useCallback((zoom: number) => dispatch({ type: 'SET_ZOOM', zoom }), []),
    select:         useCallback((item: SelectedItem) => dispatch({ type: 'SELECT', item }), []),
  }
}
