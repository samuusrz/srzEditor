import { supabase } from './supabase'
import type { TextLibraryItem, SongLibraryItem } from '../types'

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

export async function createSongItem(name: string, file: File): Promise<SongLibraryItem> {
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

// ── Storage helpers ────────────────────────────────────────────────────────

export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('srz-media').getPublicUrl(path)
  return data.publicUrl
}
