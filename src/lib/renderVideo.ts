import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Clip, TextOverlay, AudioTrack } from '../types/editor'

export type RenderProgress = { step: string; pct: number }

export async function renderVideoInBrowser(
  clips: Clip[],
  texts: TextOverlay[],
  audio: AudioTrack | null,
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
    onProgress({ step: 'Codificando…', pct: 30 + Math.round(progress * 65) })
  })

  // 1. Write clip files
  onProgress({ step: 'Cargando clips…', pct: 5 })
  const names: string[] = []
  for (let i = 0; i < clips.length; i++) {
    const name = `clip${i}.mp4`
    await ffmpeg.writeFile(name, await fetchFile(clips[i].file))
    names.push(name)
    onProgress({ step: `Cargando clip ${i + 1}/${clips.length}…`, pct: 5 + Math.round((i + 1) / clips.length * 20) })
  }

  // 2. Audio file
  let audioName: string | null = null
  if (audio) {
    audioName = 'audio_input'
    await ffmpeg.writeFile(audioName, await fetchFile(audio.file))
  }

  onProgress({ step: 'Preparando filtros…', pct: 26 })

  // 3. Build filter_complex
  const n = names.length
  const concatFilter = `${names.map((_, i) => `[${i}:v][${i}:a]`).join('')}concat=n=${n}:v=1:a=1[cv][ca]`

  const drawtextFilters = texts
    .filter(t => t.content.trim())
    .map(t => {
      // x/y are % of 1080x1920
      const px   = Math.round((t.x / 100) * 1080)
      const py   = Math.round((t.y / 100) * 1920)
      const safe = t.content.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')
      const style = t.bold ? ':fontstyle=Bold' : ''
      return `drawtext=text='${safe}':x=${px}:y=${py}:fontsize=${t.fontSize}:fontcolor=${t.color.replace('#', '0x')}:bordercolor=0x000000:borderw=4${style}:enable='between(t,${t.startAt},${t.startAt + t.duration})'`
    })

  const audioIdx = n   // input index for audio file (after video clips)

  let filterComplex: string
  let outputMap: string[]

  const hasText  = drawtextFilters.length > 0
  const hasAudio = audioName !== null

  if (hasText && hasAudio) {
    filterComplex = [
      concatFilter,
      `[cv]${drawtextFilters.join(',')}[vout]`,
      `[ca][${audioIdx}:a]amix=inputs=2:duration=first[aout]`,
    ].join(';')
    outputMap = ['-map', '[vout]', '-map', '[aout]']
  } else if (hasText) {
    filterComplex = [concatFilter, `[cv]${drawtextFilters.join(',')}[vout]`].join(';')
    outputMap = ['-map', '[vout]', '-map', '[ca]']
  } else if (hasAudio) {
    filterComplex = [concatFilter, `[ca][${audioIdx}:a]amix=inputs=2:duration=first[aout]`].join(';')
    outputMap = ['-map', '[cv]', '-map', '[aout]']
  } else {
    filterComplex = concatFilter
    outputMap = ['-map', '[cv]', '-map', '[ca]']
  }

  const inputs: string[] = names.flatMap(n => ['-i', n])
  if (audioName) inputs.push('-i', audioName)

  // 4. Run FFmpeg
  onProgress({ step: 'Renderizando…', pct: 30 })
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

  onProgress({ step: 'Finalizando…', pct: 97 })
  const data = await ffmpeg.readFile('output.mp4')
  // FFmpeg returns Uint8Array<ArrayBufferLike>; cast needed for Blob constructor
  return new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' })
}
