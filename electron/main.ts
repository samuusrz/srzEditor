import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getFfmpegPath(): string {
  const p = require('ffmpeg-static') as string
  return app.isPackaged ? p.replace('app.asar', 'app.asar.unpacked') : p
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: export-video ──────────────────────────────────────────────────────────

ipcMain.handle('export-video', async (event, payload: {
  webm: ArrayBuffer
  audio: ArrayBuffer | null
  audioStartAt: number
  audioTrimStart: number
  audioFadeIn: number
  audioFadeOut: number
  audioDuration: number
  totalDuration: number
}) => {
  // 1. Ask the user where to save before encoding
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Guardar vídeo',
    defaultPath: `srz_${Date.now()}.mp4`,
    filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
  })

  if (canceled || !filePath) return { cancelled: true }

  // 2. Write temp files
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srz-'))
  const webmPath = path.join(tmpDir, 'input.webm')
  const outputPath = filePath

  fs.writeFileSync(webmPath, Buffer.from(payload.webm))

  let audioPath: string | null = null
  if (payload.audio) {
    audioPath = path.join(tmpDir, 'audio.bin')
    fs.writeFileSync(audioPath, Buffer.from(payload.audio))
  }

  // 3. Build FFmpeg args
  const ffmpegPath = getFfmpegPath()
  const args: string[] = ['-y', '-i', webmPath]

  const videoFlags = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p']

  if (audioPath) {
    args.push('-i', audioPath)

    const trimStart = payload.audioTrimStart ?? 0
    const delayMs = Math.round((payload.audioStartAt ?? 0) * 1000)
    const af: string[] = []
    if (trimStart > 0) {
      af.push(`atrim=start=${trimStart.toFixed(3)}`)
      af.push('asetpts=PTS-STARTPTS')
    }
    af.push('aresample=44100')
    if (delayMs > 0) af.push(`adelay=${delayMs}|${delayMs}`)
    if (payload.audioFadeIn > 0)
      af.push(`afade=t=in:st=${(payload.audioStartAt).toFixed(3)}:d=${payload.audioFadeIn.toFixed(3)}`)
    if (payload.audioFadeOut > 0) {
      const st = (payload.audioStartAt + payload.audioDuration - payload.audioFadeOut).toFixed(3)
      af.push(`afade=t=out:st=${st}:d=${payload.audioFadeOut.toFixed(3)}`)
    }

    args.push(
      '-filter_complex',
      `[0:a:0]aresample=44100[ca];[1:a:0]${af.join(',')}[ea];[ca][ea]amix=inputs=2:duration=first:normalize=0[aout]`,
      '-map', '0:v:0',
      '-map', '[aout]',
      ...videoFlags,
      '-c:a', 'aac', '-b:a', '320k',
    )
  } else {
    args.push(...videoFlags, '-c:a', 'aac', '-b:a', '320k')
  }

  args.push('-movflags', '+faststart', outputPath)

  // 4. Run FFmpeg, parse progress
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, args)

    // Parse duration and time= from stderr to compute progress
    let totalSecs = payload.totalDuration || 0

    const parseDuration = (line: string) => {
      const m = line.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
      if (m) {
        totalSecs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
      }
    }

    const parseTime = (line: string) => {
      const m = line.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/)
      if (m) {
        const currentSecs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
        const ratio = totalSecs > 0 ? Math.min(1, currentSecs / totalSecs) : 0
        const pct = 88 + Math.round(ratio * 10)
        event.sender.send('export-progress', { step: 'Codificando H.264…', pct })
      }
    }

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      for (const line of text.split('\n')) {
        parseDuration(line)
        parseTime(line)
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg salió con código ${code}`))
      }
    })

    proc.on('error', reject)
  })

  // 5. Cleanup temp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }

  // 6. Show file in folder
  shell.showItemInFolder(outputPath)

  return { filePath: outputPath }
})
