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
