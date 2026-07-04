import { useReducer, useCallback } from 'react'
import type { Clip, TextOverlay, AudioTrack, SelectedItem, EditorState } from '../types/editor'

type Action =
  | { type: 'ADD_CLIP'; clip: Clip }
  | { type: 'REMOVE_CLIP'; id: string }
  | { type: 'MOVE_CLIP'; id: string; startAt: number }
  | { type: 'TRIM_CLIP'; id: string; trimStart: number; duration: number; startAt: number }
  | { type: 'SPLIT_CLIP'; clipId: string; at: number }
  | { type: 'SET_CLIP_VOLUME'; id: string; volume: number }
  | { type: 'TOGGLE_CLIP_MUTE'; id: string }
  | { type: 'EXTRACT_AUDIO'; clipId: string }
  | { type: 'ADD_TEXT'; text: TextOverlay }
  | { type: 'UPDATE_TEXT'; id: string; patch: Partial<TextOverlay> }
  | { type: 'REMOVE_TEXT'; id: string }
  | { type: 'MOVE_TEXT'; id: string; startAt: number }
  | { type: 'SET_AUDIO'; audio: AudioTrack }
  | { type: 'UPDATE_AUDIO'; patch: Partial<AudioTrack> }
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

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'ADD_CLIP': {
      const end = state.clips.reduce((m, c) => Math.max(m, c.startAt + c.duration), 0)
      return { ...state, clips: [...state.clips, { ...action.clip, startAt: end }] }
    }
    case 'REMOVE_CLIP':
      return { ...state, clips: state.clips.filter(c => c.id !== action.id), selected: null }

    case 'MOVE_CLIP':
      return {
        ...state,
        clips: state.clips.map(c =>
          c.id === action.id ? { ...c, startAt: Math.max(0, action.startAt) } : c
        ),
      }

    case 'TRIM_CLIP':
      return {
        ...state,
        clips: state.clips.map(c =>
          c.id === action.id
            ? { ...c, trimStart: action.trimStart, duration: action.duration, startAt: action.startAt }
            : c
        ),
      }

    case 'SPLIT_CLIP': {
      const clip = state.clips.find(c => c.id === action.clipId)
      if (!clip) return state
      const offset = action.at - clip.startAt
      if (offset <= 0.05 || offset >= clip.duration - 0.05) return state
      const clip1: Clip = { ...clip, duration: offset }
      const clip2: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        startAt: action.at,
        trimStart: clip.trimStart + offset,
        duration: clip.duration - offset,
      }
      const newClips: Clip[] = []
      for (const c of state.clips) {
        newClips.push(c.id === action.clipId ? clip1 : c)
        if (c.id === action.clipId) newClips.push(clip2)
      }
      return { ...state, clips: newClips }
    }

    case 'SET_CLIP_VOLUME':
      return {
        ...state,
        clips: state.clips.map(c =>
          c.id === action.id ? { ...c, volume: action.volume } : c
        ),
      }

    case 'TOGGLE_CLIP_MUTE':
      return {
        ...state,
        clips: state.clips.map(c =>
          c.id === action.id ? { ...c, muted: !c.muted } : c
        ),
      }

    case 'EXTRACT_AUDIO': {
      const clip = state.clips.find(c => c.id === action.clipId)
      if (!clip) return state
      const audioTrack: AudioTrack = {
        id: crypto.randomUUID(),
        file: clip.file,
        localUrl: clip.localUrl,
        name: `Audio · ${clip.name}`,
        startAt: clip.startAt,
        duration: clip.duration,
        volume: 1,
      }
      return {
        ...state,
        audio: audioTrack,
        clips: state.clips.map(c => c.id === action.clipId ? { ...c, muted: true } : c),
      }
    }

    case 'ADD_TEXT':
      return { ...state, texts: [...state.texts, action.text], selected: { type: 'text', id: action.text.id } }
    case 'UPDATE_TEXT':
      return { ...state, texts: state.texts.map(t => t.id === action.id ? { ...t, ...action.patch } : t) }
    case 'REMOVE_TEXT':
      return { ...state, texts: state.texts.filter(t => t.id !== action.id), selected: null }
    case 'MOVE_TEXT':
      return {
        ...state,
        texts: state.texts.map(t =>
          t.id === action.id ? { ...t, startAt: Math.max(0, action.startAt) } : t
        ),
      }

    case 'SET_AUDIO':
      return { ...state, audio: action.audio }
    case 'UPDATE_AUDIO':
      return { ...state, audio: state.audio ? { ...state.audio, ...action.patch } : null }
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
    addClip:         useCallback((clip: Clip) => dispatch({ type: 'ADD_CLIP', clip }), []),
    removeClip:      useCallback((id: string) => dispatch({ type: 'REMOVE_CLIP', id }), []),
    moveClip:        useCallback((id: string, startAt: number) => dispatch({ type: 'MOVE_CLIP', id, startAt }), []),
    trimClip:        useCallback((id: string, trimStart: number, duration: number, startAt: number) => dispatch({ type: 'TRIM_CLIP', id, trimStart, duration, startAt }), []),
    splitClip:       useCallback((clipId: string, at: number) => dispatch({ type: 'SPLIT_CLIP', clipId, at }), []),
    setClipVolume:   useCallback((id: string, volume: number) => dispatch({ type: 'SET_CLIP_VOLUME', id, volume }), []),
    toggleClipMute:  useCallback((id: string) => dispatch({ type: 'TOGGLE_CLIP_MUTE', id }), []),
    extractAudio:    useCallback((clipId: string) => dispatch({ type: 'EXTRACT_AUDIO', clipId }), []),
    addText:         useCallback((text: TextOverlay) => dispatch({ type: 'ADD_TEXT', text }), []),
    updateText:      useCallback((id: string, patch: Partial<TextOverlay>) => dispatch({ type: 'UPDATE_TEXT', id, patch }), []),
    removeText:      useCallback((id: string) => dispatch({ type: 'REMOVE_TEXT', id }), []),
    moveText:        useCallback((id: string, startAt: number) => dispatch({ type: 'MOVE_TEXT', id, startAt }), []),
    setAudio:        useCallback((audio: AudioTrack) => dispatch({ type: 'SET_AUDIO', audio }), []),
    updateAudio:     useCallback((patch: Partial<AudioTrack>) => dispatch({ type: 'UPDATE_AUDIO', patch }), []),
    removeAudio:     useCallback(() => dispatch({ type: 'REMOVE_AUDIO' }), []),
    setPlayhead:     useCallback((time: number) => dispatch({ type: 'SET_PLAYHEAD', time }), []),
    setPlaying:      useCallback((playing: boolean) => dispatch({ type: 'SET_PLAYING', playing }), []),
    setZoom:         useCallback((zoom: number) => dispatch({ type: 'SET_ZOOM', zoom }), []),
    select:          useCallback((item: SelectedItem) => dispatch({ type: 'SELECT', item }), []),
  }
}
