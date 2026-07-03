import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { TemplateWithSlots, ProjectClip, ProjectText, SongLibraryItem } from '../types'
import { getPublicUrl } from './db'

export type RenderProgress = {
  step: string
  pct: number
}

export async function renderVideoInBrowser(
  template: TemplateWithSlots,
  clips: ProjectClip[],
  texts: ProjectText[],
  audio: { song: SongLibraryItem; startAt: number } | null,
  onProgress: (p: RenderProgress) => void,
): Promise<Blob> {
  onProgress({ step: 'Cargando FFmpeg…', pct: 0 })

  const ffmpeg = new FFmpeg()

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  ffmpeg.on('progress', ({ progress }) => {
    onProgress({ step: 'Renderizando…', pct: Math.round(progress * 100) })
  })

  // 1. Write clips to FFmpeg FS
  onProgress({ step: 'Cargando clips…', pct: 5 })
  const clipNames: string[] = []
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const name = `clip${i}.mp4`
    if (clip.file) {
      await ffmpeg.writeFile(name, await fetchFile(clip.file))
    } else {
      const url = getPublicUrl(clip.storage_path)
      await ffmpeg.writeFile(name, await fetchFile(url))
    }
    clipNames.push(name)
    onProgress({ step: `Cargando clip ${i + 1}/${clips.length}…`, pct: 5 + Math.round((i + 1) / clips.length * 20) })
  }

  // 2. Build drawtext filters for text overlays
  const drawtextFilters = texts
    .filter(t => t.final_text.trim())
    .map(t => {
      const slot = template.text_slots.find(s => s.id === t.text_slot_id)
      const x = t.position_override_x ?? slot?.position_x ?? 50
      const y = t.position_override_y ?? slot?.position_y ?? 10
      const startAt = slot?.start_at ?? 0
      const endAt = slot?.end_at ?? (startAt + 3)
      // x/y are percentages of the canvas (1080x1920)
      const px = Math.round((x / 100) * 1080)
      const py = Math.round((y / 100) * 1920)
      const safe = t.final_text.replace(/'/g, "\\'").replace(/:/g, '\\:')
      return `drawtext=text='${safe}':x=${px}:y=${py}:fontsize=64:fontcolor=white:bordercolor=black:borderw=4:enable='between(t,${startAt},${endAt})'`
    })

  // 3. Build concat filter + optional audio mix
  onProgress({ step: 'Preparando filtros…', pct: 26 })

  let audioFile: string | null = null
  if (audio) {
    const url = getPublicUrl(audio.song.storage_path)
    audioFile = 'audio.mp3'
    await ffmpeg.writeFile(audioFile, await fetchFile(url))
  }

  const inputs: string[] = [...clipNames.map(n => ['-i', n]).flat()]
  if (audioFile) inputs.push('-i', audioFile)

  const n = clipNames.length
  const concatFilter = `${clipNames.map((_, i) => `[${i}:v][${i}:a]`).join('')}concat=n=${n}:v=1:a=1[cv][ca]`

  let filterComplex: string
  let outputMap: string[]

  if (audioFile && drawtextFilters.length > 0) {
    const audioIdx = n
    filterComplex = [
      concatFilter,
      `[cv]${drawtextFilters.join(',')}[vout]`,
      `[ca][${audioIdx}:a]amix=inputs=2:duration=first[aout]`,
    ].join(';')
    outputMap = ['-map', '[vout]', '-map', '[aout]']
  } else if (audioFile) {
    const audioIdx = n
    filterComplex = [
      concatFilter,
      `[ca][${audioIdx}:a]amix=inputs=2:duration=first[aout]`,
    ].join(';')
    outputMap = ['-map', '[cv]', '-map', '[aout]']
  } else if (drawtextFilters.length > 0) {
    filterComplex = [
      concatFilter,
      `[cv]${drawtextFilters.join(',')}[vout]`,
    ].join(';')
    outputMap = ['-map', '[vout]', '-map', '[ca]']
  } else {
    filterComplex = concatFilter
    outputMap = ['-map', '[cv]', '-map', '[ca]']
  }

  // 4. Run FFmpeg
  onProgress({ step: 'Renderizando vídeo…', pct: 30 })
  await ffmpeg.exec([
    ...inputs,
    '-filter_complex', filterComplex,
    ...outputMap,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  // 5. Read output
  onProgress({ step: 'Finalizando…', pct: 95 })
  const data = await ffmpeg.readFile('output.mp4')
  return new Blob([data], { type: 'video/mp4' })
}
