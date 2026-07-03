export interface Template {
  id: string
  name: string
  description: string | null
  aspect_ratio: string
  fps: number
  resolution: string
  total_duration: number
  created_at: string
  updated_at: string
}

export interface TemplateClipSlot {
  id: string
  template_id: string
  slot_order: number
  label: string
  duration: number
  start_at: number
}

export interface TemplateTextSlot {
  id: string
  template_id: string
  position_x: number
  position_y: number
  start_at: number
  end_at: number
  default_text_id: string | null
}

export interface TemplateAudioSlot {
  id: string
  template_id: string
  start_at: number
  default_song_id: string | null
}

export interface TextLibraryItem {
  id: string
  content: string
  tags: string[] | null
  created_at: string
}

export interface SongLibraryItem {
  id: string
  name: string
  storage_path: string
  duration: number | null
  created_at: string
}

export interface VideoProject {
  id: string
  template_id: string | null
  status: 'draft' | 'rendering' | 'done' | 'failed'
  final_video_path: string | null
  created_at: string
  template?: Template
}

export interface ProjectClip {
  id: string
  project_id: string
  slot_id: string
  storage_path: string
  duration_override: number | null
  // local only (before upload)
  file?: File
  localUrl?: string
  slot?: TemplateClipSlot
}

export interface ProjectText {
  id: string
  project_id: string
  text_slot_id: string | null
  final_text: string
  position_override_x: number | null
  position_override_y: number | null
}

export interface ProjectAudio {
  id: string
  project_id: string
  song_id: string | null
  start_at_override: number | null
  song?: SongLibraryItem
}

// Full template with all slots
export interface TemplateWithSlots extends Template {
  clip_slots: TemplateClipSlot[]
  text_slots: TemplateTextSlot[]
  audio_slot: TemplateAudioSlot | null
}

// Render payload
export interface RenderPayload {
  project_id: string
  output: {
    resolution: string
    fps: number
    format: string
  }
  clips: Array<{
    slot_order: number
    storage_path: string
    start_at: number
    duration: number
  }>
  texts: Array<{
    content: string
    x: number
    y: number
    start_at: number
    end_at: number
  }>
  audio: {
    storage_path: string
    start_at: number
  } | null
}
