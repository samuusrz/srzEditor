import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createWriteStream, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { randomUUID } from 'crypto'

const execFileAsync = promisify(execFile)

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const PORT = process.env.PORT || 3001
const BUCKET = 'srz-media'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const app = express()
app.use(express.json({ limit: '1mb' }))

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }))

// ── Main render endpoint ───────────────────────────────────────────────────
app.post('/render', async (req, res) => {
  const payload = req.body
  const { project_id, output, clips, texts, audio } = payload

  if (!project_id || !clips?.length) {
    return res.status(400).json({ error: 'project_id and clips required' })
  }

  const workDir = `/tmp/srz_${randomUUID()}`
  mkdirSync(workDir, { recursive: true })
  console.log(`[${project_id}] Starting render in ${workDir}`)

  // Mark as rendering
  await supabase
    .from('video_projects')
    .update({ status: 'rendering' })
    .eq('id', project_id)

  // Respond immediately — render is async
  res.json({ ok: true, project_id, message: 'Render started' })

  // Run async
  runRender({ project_id, output, clips, texts, audio, workDir }).catch(async (err) => {
    console.error(`[${project_id}] Render failed:`, err)
    await supabase
      .from('video_projects')
      .update({ status: 'failed' })
      .eq('id', project_id)
    cleanup(workDir)
  })
})

async function runRender({ project_id, output, clips, texts, audio, workDir }) {
  const { resolution = '1080x1920', fps = 60 } = output
  const [width, height] = resolution.split('x').map(Number)

  // 1. Download all files
  console.log(`[${project_id}] Downloading ${clips.length} clips...`)
  const clipPaths = []
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const localPath = join(workDir, `clip_${i}.mp4`)
    await downloadFromStorage(clip.storage_path, localPath)
    clipPaths.push({ ...clip, localPath })
  }

  let audioPath = null
  if (audio?.storage_path) {
    console.log(`[${project_id}] Downloading audio...`)
    audioPath = join(workDir, 'audio.aac')
    await downloadFromStorage(audio.storage_path, audioPath)
  }

  // 2. Trim each clip to its duration and scale to target resolution
  console.log(`[${project_id}] Trimming and scaling clips...`)
  const trimmedPaths = []
  for (let i = 0; i < clipPaths.length; i++) {
    const { localPath, duration } = clipPaths[i]
    const trimmed = join(workDir, `trimmed_${i}.mp4`)
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', localPath,
      '-t', String(duration),
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
      '-an',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-r', String(fps),
      trimmed,
    ])
    trimmedPaths.push(trimmed)
  }

  // 3. Concatenate clips
  console.log(`[${project_id}] Concatenating...`)
  const concatList = join(workDir, 'concat.txt')
  const concatContent = trimmedPaths.map(p => `file '${p}'`).join('\n')
  await writeFile(concatList, concatContent)

  const concatenated = join(workDir, 'concat.mp4')
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatList,
    '-c', 'copy',
    concatenated,
  ])

  // 4. Apply drawtext overlays
  let currentInput = concatenated
  if (texts?.length > 0) {
    console.log(`[${project_id}] Adding ${texts.length} text overlay(s)...`)
    const withText = join(workDir, 'with_text.mp4')

    // Build drawtext filter chain
    const drawtextFilters = texts
      .filter(t => t.content?.trim())
      .map(t => {
        const x = `(w*${t.x / 100})`
        const y = `(h*${t.y / 100})`
        const escapedText = t.content.replace(/'/g, "\\'").replace(/:/g, '\\:')
        return `drawtext=text='${escapedText}':x=${x}:y=${y}:fontsize=h/18:fontcolor=white:borderw=2:bordercolor=black:enable='between(t\\,${t.start_at}\\,${t.end_at})'`
      })
      .join(',')

    if (drawtextFilters) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', currentInput,
        '-vf', drawtextFilters,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-an',
        withText,
      ])
      currentInput = withText
    }
  }

  // 5. Mix audio
  const outputPath = join(workDir, 'output.mp4')
  if (audioPath && audio?.start_at !== undefined) {
    console.log(`[${project_id}] Mixing audio at ${audio.start_at}s...`)
    const delayMs = Math.round(audio.start_at * 1000)
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', currentInput,
      '-i', audioPath,
      '-filter_complex', `[1:a]adelay=${delayMs}|${delayMs}[delayed];[delayed]apad[aout]`,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      outputPath,
    ])
  } else {
    // No audio — just copy video
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', currentInput,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-an',
      outputPath,
    ])
  }

  // 6. Upload to Supabase Storage
  console.log(`[${project_id}] Uploading result...`)
  const { readFile } = await import('fs/promises')
  const fileBuffer = await readFile(outputPath)
  const storagePath = `exports/${project_id}/output.mp4`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    })

  if (upErr) throw upErr

  // 7. Update project status
  await supabase
    .from('video_projects')
    .update({ status: 'done', final_video_path: storagePath })
    .eq('id', project_id)

  console.log(`[${project_id}] Done! → ${storagePath}`)
  cleanup(workDir)
}

async function downloadFromStorage(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
  if (error) throw new Error(`Storage download failed for ${storagePath}: ${error.message}`)
  const writer = createWriteStream(localPath)
  await pipeline(Readable.fromWeb(data.stream()), writer)
}

async function writeFile(path, content) {
  const { writeFile } = await import('fs/promises')
  await writeFile(path, content, 'utf8')
}

function cleanup(workDir) {
  try { rmSync(workDir, { recursive: true, force: true }) } catch {}
}

app.listen(PORT, () => {
  console.log(`SRZ Render Service listening on port ${PORT}`)
})
