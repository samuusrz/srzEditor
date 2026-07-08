import { supabase } from './supabase'
import type {
  Template,
  TemplateClipSlot,
  TemplateTextSlot,
  TemplateAudioSlot,
  TemplateWithSlots,
  TextLibraryItem,
  SongLibraryItem,
  VideoProject,
  ProjectClip,
  ProjectText,
  ProjectAudio,
} from '../types'

// ── Templates ──────────────────────────────────────────────────────────────

export async function getTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getTemplateWithSlots(id: string): Promise<TemplateWithSlots> {
  const [tmplRes, clipRes, textRes, audioRes] = await Promise.all([
    supabase.from('templates').select('*').eq('id', id).single(),
    supabase.from('template_clip_slots').select('*').eq('template_id', id).order('slot_order'),
    supabase.from('template_text_slots').select('*').eq('template_id', id),
    supabase.from('template_audio_slot').select('*').eq('template_id', id).maybeSingle(),
  ])
  if (tmplRes.error) throw tmplRes.error
  return {
    ...tmplRes.data,
    clip_slots: clipRes.data ?? [],
    text_slots: textRes.data ?? [],
    audio_slot: audioRes.data ?? null,
  }
}

export async function createTemplate(
  template: Omit<Template, 'id' | 'created_at' | 'updated_at'>,
  clipSlots: Omit<TemplateClipSlot, 'id' | 'template_id'>[],
  textSlots: Omit<TemplateTextSlot, 'id' | 'template_id'>[],
  audioSlot: Omit<TemplateAudioSlot, 'id' | 'template_id'> | null,
): Promise<string> {
  const { data: tmpl, error: tmplErr } = await supabase
    .from('templates')
    .insert(template)
    .select('id')
    .single()
  if (tmplErr) throw tmplErr

  const id = tmpl.id

  if (clipSlots.length > 0) {
    const { error } = await supabase
      .from('template_clip_slots')
      .insert(clipSlots.map(s => ({ ...s, template_id: id })))
    if (error) throw error
  }

  if (textSlots.length > 0) {
    const { error } = await supabase
      .from('template_text_slots')
      .insert(textSlots.map(s => ({ ...s, template_id: id })))
    if (error) throw error
  }

  if (audioSlot) {
    const { error } = await supabase
      .from('template_audio_slot')
      .insert({ ...audioSlot, template_id: id })
    if (error) throw error
  }

  return id
}

export async function updateTemplate(
  id: string,
  template: Partial<Template>,
  clipSlots: Omit<TemplateClipSlot, 'id' | 'template_id'>[],
  textSlots: Omit<TemplateTextSlot, 'id' | 'template_id'>[],
  audioSlot: Omit<TemplateAudioSlot, 'id' | 'template_id'> | null,
): Promise<void> {
  const { error: tmplErr } = await supabase
    .from('templates')
    .update({ ...template, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (tmplErr) throw tmplErr

  // Replace slots entirely
  await supabase.from('template_clip_slots').delete().eq('template_id', id)
  await supabase.from('template_text_slots').delete().eq('template_id', id)
  await supabase.from('template_audio_slot').delete().eq('template_id', id)

  if (clipSlots.length > 0) {
    const { error } = await supabase
      .from('template_clip_slots')
      .insert(clipSlots.map(s => ({ ...s, template_id: id })))
    if (error) throw error
  }

  if (textSlots.length > 0) {
    const { error } = await supabase
      .from('template_text_slots')
      .insert(textSlots.map(s => ({ ...s, template_id: id })))
    if (error) throw error
  }

  if (audioSlot) {
    const { error } = await supabase
      .from('template_audio_slot')
      .insert({ ...audioSlot, template_id: id })
    if (error) throw error
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) throw error
}

// ── Text Library ───────────────────────────────────────────────────────────

export async function getTextLibrary(): Promise<TextLibraryItem[]> {
  const { data, error } = await supabase
    .from('text_library')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createTextItem(content: string, tags?: string[]): Promise<TextLibraryItem> {
  const { data, error } = await supabase
    .from('text_library')
    .insert({ content, tags: tags ?? [] })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTextItem(id: string, content: string, tags?: string[]): Promise<void> {
  const { error } = await supabase
    .from('text_library')
    .update({ content, tags: tags ?? [] })
    .eq('id', id)
  if (error) throw error
}

export async function deleteTextItem(id: string): Promise<void> {
  const { error } = await supabase.from('text_library').delete().eq('id', id)
  if (error) throw error
}

// ── Song Library ───────────────────────────────────────────────────────────

export async function getSongLibrary(): Promise<SongLibraryItem[]> {
  const { data, error } = await supabase
    .from('song_library')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createSongItem(
  name: string,
  file: File,
): Promise<SongLibraryItem> {
  const path = `songs/${Date.now()}_${file.name}`
  const { error: upErr } = await supabase.storage
    .from('srz-media')
    .upload(path, file, { contentType: file.type })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('song_library')
    .insert({ name, storage_path: path })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSongItem(id: string, storagePath: string): Promise<void> {
  await supabase.storage.from('srz-media').remove([storagePath])
  const { error } = await supabase.from('song_library').delete().eq('id', id)
  if (error) throw error
}

// ── Video Projects ─────────────────────────────────────────────────────────

export async function getProjects(): Promise<VideoProject[]> {
  const { data, error } = await supabase
    .from('video_projects')
    .select('*, template:templates(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function deleteVideoProject(id: string): Promise<void> {
  const { error } = await supabase.from('video_projects').delete().eq('id', id)
  if (error) throw error
}

export async function createProject(templateId: string): Promise<string> {
  const { data, error } = await supabase
    .from('video_projects')
    .insert({ template_id: templateId, status: 'draft' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function getProjectClips(projectId: string): Promise<ProjectClip[]> {
  const { data, error } = await supabase
    .from('project_clips')
    .select('*, slot:template_clip_slots(*)')
    .eq('project_id', projectId)
  if (error) throw error
  return data
}

export async function upsertProjectClips(
  projectId: string,
  clips: Array<{ slot_id: string; storage_path: string; duration_override?: number | null }>,
): Promise<void> {
  await supabase.from('project_clips').delete().eq('project_id', projectId)
  if (clips.length === 0) return
  const { error } = await supabase
    .from('project_clips')
    .insert(clips.map(c => ({ ...c, project_id: projectId })))
  if (error) throw error
}

export async function getProjectTexts(projectId: string): Promise<ProjectText[]> {
  const { data, error } = await supabase
    .from('project_texts')
    .select('*')
    .eq('project_id', projectId)
  if (error) throw error
  return data
}

export async function upsertProjectTexts(
  projectId: string,
  texts: Array<{
    text_slot_id: string | null
    final_text: string
    position_override_x?: number | null
    position_override_y?: number | null
  }>,
): Promise<void> {
  await supabase.from('project_texts').delete().eq('project_id', projectId)
  if (texts.length === 0) return
  const { error } = await supabase
    .from('project_texts')
    .insert(texts.map(t => ({ ...t, project_id: projectId })))
  if (error) throw error
}

export async function getProjectAudio(projectId: string): Promise<ProjectAudio | null> {
  const { data, error } = await supabase
    .from('project_audio')
    .select('*, song:song_library(*)')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertProjectAudio(
  projectId: string,
  songId: string,
  startAtOverride?: number | null,
): Promise<void> {
  await supabase.from('project_audio').delete().eq('project_id', projectId)
  const { error } = await supabase
    .from('project_audio')
    .insert({ project_id: projectId, song_id: songId, start_at_override: startAtOverride ?? null })
  if (error) throw error
}

// ── Storage helpers ────────────────────────────────────────────────────────

export async function uploadClip(projectId: string, file: File): Promise<string> {
  const path = `clips/${projectId}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage
    .from('srz-media')
    .upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}

export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('srz-media').getPublicUrl(path)
  return data.publicUrl
}
