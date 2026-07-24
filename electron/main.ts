import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import {
  compressPdf,
  compressToTarget,
  estimatePreview,
  findGhostscript,
  getFileInfo,
  type CompressResult,
  type QualityPreset,
} from './compress'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 860,
    minWidth: 580,
    minHeight: 700,
    title: 'MojitoPDF',
    backgroundColor: '#12241c',
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
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

ipcMain.handle('ghostscript:check', async () => {
  const gsPath = await findGhostscript()
  return { available: Boolean(gsPath), path: gsPath }
})

ipcMain.handle('dialog:openPdf', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Scegli un PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:savePdf', async (_event, defaultPath: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Salva PDF compresso',
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

ipcMain.handle('pdf:fileInfo', async (_event, filePath: string) => {
  return getFileInfo(filePath)
})

ipcMain.handle(
  'pdf:preview',
  async (
    _event,
    payload: { inputPath: string; preset: QualityPreset; flatten?: boolean },
  ) => {
    return estimatePreview(payload.inputPath, payload.preset, payload.flatten !== false)
  },
)

ipcMain.handle(
  'pdf:compress',
  async (
    _event,
    payload: {
      inputPath: string
      outputPath?: string
      preset: QualityPreset
      flatten?: boolean
    },
  ): Promise<CompressResult> => {
    return compressPdf(payload)
  },
)

ipcMain.handle(
  'pdf:compressTarget',
  async (
    _event,
    payload: {
      inputPath: string
      outputPath?: string
      targetBytes: number
      flatten?: boolean
    },
  ): Promise<CompressResult> => {
    return compressToTarget(payload)
  },
)

ipcMain.handle('shell:showItem', async (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url)
})
