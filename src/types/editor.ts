export interface Clip {
  id: string
  file: File
  localUrl: string
  name: string
  thumbnail: string
  startAt: number
  duration: number
  originalDuration: number
  trimStart: number
  volume: number
  muted: boolean
  track: number   // video track index (0 = top)
}

export interface TextOverlay {
  id: string
  content: string
  startAt: number
  duration: number
  x: number
  y: number
  fontSize: number
  color: string
  bold: boolean
  track: number   // text track index (0 = top)
}

export interface VolumeKeyframe {
  time: number    // absolute seconds on timeline
  volume: number  // 0–1
}

export interface AudioTrack {
  id: string
  file: File
  localUrl: string
  name: string
  startAt: number
  duration: number
  originalDuration: number    // full file duration (cap for right trim)
  volume: number
  fadeIn: number
  fadeOut: number
  keyframes: VolumeKeyframe[]  // volume automation
}

export type SelectedItem =
  | { type: 'clip'; id: string }
  | { type: 'text'; id: string }
  | { type: 'audio' }
  | { type: 'multi'; clipIds: string[]; textIds: string[] }
  | null

export interface EditorState {
  clips: Clip[]
  texts: TextOverlay[]
  audio: AudioTrack | null
  playhead: number
  playing: boolean
  zoom: number
  selected: SelectedItem
}
