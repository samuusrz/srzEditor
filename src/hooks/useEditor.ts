import { useReducer, useCallback } from 'react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem, EditorState, VolumeKeyframe } from '../types/editor'

// ── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_CLIP'; clip: Clip }
  | { type: 'REMOVE_CLIP'; id: string }
  | { type: 'MOVE_CLIP'; id: string; startAt: number }          // drag (not undoable)
  | { type: 'TRIM_CLIP'; id: string; trimStart: number; duration: number; startAt: number } // drag
  | { type: 'SPLIT_CLIP'; clipId: string; at: number }
  | { type: 'SET_CLIP_VOLUME'; id: string; volume: number }
  | { type: 'TOGGLE_CLIP_MUTE'; id: string }
  | { type: 'EXTRACT_AUDIO'; clipId: string }
  | { type: 'ADD_TEXT'; text: TextOverlay }
  | { type: 'UPDATE_TEXT'; id: string; patch: Partial<TextOverlay> }  // undoable
  | { type: 'DRAG_TEXT_POS'; id: string; x: number; y: number }       // drag (not undoable)
  | { type: 'REMOVE_TEXT'; id: string }
  | { type: 'MOVE_TEXT'; id: string; startAt: number }          // drag (not undoable)
  | { type: 'SET_AUDIO'; audio: AudioTrack }
  | { type: 'UPDATE_AUDIO'; patch: Partial<AudioTrack> }        // undoable (property panel)
  | { type: 'DRAG_AUDIO_POS'; startAt: number }                 // drag (not undoable)
  | { type: 'DRAG_AUDIO_KF'; keyframes: VolumeKeyframe[] }      // drag (not undoable)
  | { type: 'REMOVE_AUDIO' }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SELECT'; item: SelectedItem }

// Only these actions are saved to the undo history
const UNDOABLE = new Set([
  'ADD_CLIP', 'REMOVE_CLIP', 'SPLIT_CLIP',
  'SET_CLIP_VOLUME', 'TOGGLE_CLIP_MUTE', 'EXTRACT_AUDIO',
  'ADD_TEXT', 'UPDATE_TEXT', 'REMOVE_TEXT',
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
      return { ...state, clips: [...state.clips, { ...action.clip, startAt: end }] }
    }
    case 'REMOVE_CLIP':
      return { ...state, clips: state.clips.filter(c => c.id !== action.id), selected: null }
    case 'MOVE_CLIP':
      return { ...state, clips: state.clips.map(c => c.id === action.id ? { ...c, startAt: Math.max(0, action.startAt) } : c) }
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
      return { ...state, clips }
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
    case 'REMOVE_TEXT':
      return { ...state, texts: state.texts.filter(t => t.id !== action.id), selected: null }
    case 'MOVE_TEXT':
      return { ...state, texts: state.texts.map(t => t.id === action.id ? { ...t, startAt: Math.max(0, action.startAt) } : t) }
    case 'SET_AUDIO':
      return { ...state, audio: action.audio }
    case 'UPDATE_AUDIO':
      return { ...state, audio: state.audio ? { ...state.audio, ...action.patch } : null }
    case 'DRAG_AUDIO_POS':
      return { ...state, audio: state.audio ? { ...state.audio, startAt: Math.max(0, action.startAt) } : null }
    case 'DRAG_AUDIO_KF':
      return { ...state, audio: state.audio ? { ...state.audio, keyframes: action.keyframes } : null }
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
    addClip:        useCallback((clip: Clip) => dispatch({ type: 'ADD_CLIP', clip }), []),
    removeClip:     useCallback((id: string) => dispatch({ type: 'REMOVE_CLIP', id }), []),
    moveClip:       useCallback((id: string, startAt: number) => dispatch({ type: 'MOVE_CLIP', id, startAt }), []),
    trimClip:       useCallback((id: string, trimStart: number, duration: number, startAt: number) => dispatch({ type: 'TRIM_CLIP', id, trimStart, duration, startAt }), []),
    splitClip:      useCallback((clipId: string, at: number) => dispatch({ type: 'SPLIT_CLIP', clipId, at }), []),
    setClipVolume:  useCallback((id: string, volume: number) => dispatch({ type: 'SET_CLIP_VOLUME', id, volume }), []),
    toggleClipMute: useCallback((id: string) => dispatch({ type: 'TOGGLE_CLIP_MUTE', id }), []),
    extractAudio:   useCallback((clipId: string) => dispatch({ type: 'EXTRACT_AUDIO', clipId }), []),
    addText:        useCallback((text: TextOverlay) => dispatch({ type: 'ADD_TEXT', text }), []),
    updateText:     useCallback((id: string, patch: Partial<TextOverlay>) => dispatch({ type: 'UPDATE_TEXT', id, patch }), []),
    dragTextPos:    useCallback((id: string, x: number, y: number) => dispatch({ type: 'DRAG_TEXT_POS', id, x, y }), []),
    removeText:     useCallback((id: string) => dispatch({ type: 'REMOVE_TEXT', id }), []),
    moveText:       useCallback((id: string, startAt: number) => dispatch({ type: 'MOVE_TEXT', id, startAt }), []),
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
