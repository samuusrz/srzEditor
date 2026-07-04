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
  volume: number    // 0–1
  muted: boolean
}

export interface TextOverlay {
  id: string
  content: string
  startAt: number
  duration: number
  x: number        // 0–100 (% of preview width)
  y: number        // 0–100 (% of preview height)
  fontSize: number
  color: string
  bold: boolean
}

export interface AudioTrack {
  id: string
  file: File
  localUrl: string
  name: string
  startAt: number
  duration: number
  volume: number
}

export type SelectedItem =
  | { type: 'clip'; id: string }
  | { type: 'text'; id: string }
  | { type: 'audio' }
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
