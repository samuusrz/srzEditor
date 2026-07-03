import { useReducer, useCallback } from 'react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem, EditorState } from '../types/editor'

type Action =
  | { type: 'ADD_CLIP'; clip: Clip }
  | { type: 'REMOVE_CLIP'; id: string }
  | { type: 'MOVE_CLIP'; id: string; startAt: number }
  | { type: 'PACK_CLIPS'; order: string[] }
  | { type: 'ADD_TEXT'; text: TextOverlay }
  | { type: 'UPDATE_TEXT'; id: string; patch: Partial<TextOverlay> }
  | { type: 'REMOVE_TEXT'; id: string }
  | { type: 'SET_AUDIO'; audio: AudioTrack }
  | { type: 'REMOVE_AUDIO' }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SELECT'; item: SelectedItem }

const init: EditorState = {
  clips: [],
  texts: [],
  audio: null,
  playhead: 0,
  playing: false,
  zoom: 100,
  selected: null,
}

function packSequential(clips: Clip[]): Clip[] {
  let cursor = 0
  return clips.map(c => {
    const next = { ...c, startAt: cursor }
    cursor += c.duration
    return next
  })
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'ADD_CLIP': {
      const end = state.clips.reduce((m, c) => Math.max(m, c.startAt + c.duration), 0)
      return { ...state, clips: [...state.clips, { ...action.clip, startAt: end }] }
    }
    case 'REMOVE_CLIP': {
      const next = packSequential(state.clips.filter(c => c.id !== action.id))
      return { ...state, clips: next, selected: null }
    }
    case 'MOVE_CLIP':
      return {
        ...state,
        clips: state.clips.map(c =>
          c.id === action.id ? { ...c, startAt: Math.max(0, action.startAt) } : c
        ),
      }
    case 'PACK_CLIPS': {
      const ordered = action.order
        .map(id => state.clips.find(c => c.id === id))
        .filter(Boolean) as Clip[]
      return { ...state, clips: packSequential(ordered) }
    }
    case 'ADD_TEXT':
      return { ...state, texts: [...state.texts, action.text], selected: { type: 'text', id: action.text.id } }
    case 'UPDATE_TEXT':
      return { ...state, texts: state.texts.map(t => t.id === action.id ? { ...t, ...action.patch } : t) }
    case 'REMOVE_TEXT':
      return { ...state, texts: state.texts.filter(t => t.id !== action.id), selected: null }
    case 'SET_AUDIO':
      return { ...state, audio: action.audio }
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

export function useEditor() {
  const [state, dispatch] = useReducer(reducer, init)

  const totalDuration = state.clips.reduce((m, c) => Math.max(m, c.startAt + c.duration), 0)

  return {
    state,
    totalDuration,
    addClip:    useCallback((clip: Clip) => dispatch({ type: 'ADD_CLIP', clip }), []),
    removeClip: useCallback((id: string) => dispatch({ type: 'REMOVE_CLIP', id }), []),
    moveClip:   useCallback((id: string, startAt: number) => dispatch({ type: 'MOVE_CLIP', id, startAt }), []),
    packClips:  useCallback((order: string[]) => dispatch({ type: 'PACK_CLIPS', order }), []),
    addText:    useCallback((text: TextOverlay) => dispatch({ type: 'ADD_TEXT', text }), []),
    updateText: useCallback((id: string, patch: Partial<TextOverlay>) => dispatch({ type: 'UPDATE_TEXT', id, patch }), []),
    removeText: useCallback((id: string) => dispatch({ type: 'REMOVE_TEXT', id }), []),
    setAudio:   useCallback((audio: AudioTrack) => dispatch({ type: 'SET_AUDIO', audio }), []),
    removeAudio: useCallback(() => dispatch({ type: 'REMOVE_AUDIO' }), []),
    setPlayhead: useCallback((time: number) => dispatch({ type: 'SET_PLAYHEAD', time }), []),
    setPlaying:  useCallback((playing: boolean) => dispatch({ type: 'SET_PLAYING', playing }), []),
    setZoom:     useCallback((zoom: number) => dispatch({ type: 'SET_ZOOM', zoom }), []),
    select:      useCallback((item: SelectedItem) => dispatch({ type: 'SELECT', item }), []),
  }
}
