import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  exportVideo: (payload: unknown) => ipcRenderer.invoke('export-video', payload),
  onExportProgress: (cb: (data: { step: string; pct: number }) => void) => {
    ipcRenderer.removeAllListeners('export-progress')
    ipcRenderer.on('export-progress', (_event, data) => cb(data))
  },
  offExportProgress: () => ipcRenderer.removeAllListeners('export-progress'),
})
