import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  QualityPreset,
  CompressResult,
  GhostscriptStatus,
  PreviewResult,
  FileInfoResult,
} from './compress'

export type PdfDietApi = {
  checkGhostscript: () => Promise<GhostscriptStatus>
  openPdfDialog: () => Promise<string | null>
  savePdfDialog: (defaultPath: string) => Promise<string | null>
  getFileInfo: (filePath: string) => Promise<FileInfoResult>
  previewPdf: (payload: {
    inputPath: string
    preset: QualityPreset
    flatten?: boolean
  }) => Promise<PreviewResult>
  compressPdf: (payload: {
    inputPath: string
    outputPath?: string
    preset: QualityPreset
    flatten?: boolean
  }) => Promise<CompressResult>
  compressToTarget: (payload: {
    inputPath: string
    outputPath?: string
    targetBytes: number
    flatten?: boolean
  }) => Promise<CompressResult>
  showInFolder: (filePath: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getPathForFile: (file: File) => string
}

const api: PdfDietApi = {
  checkGhostscript: () => ipcRenderer.invoke('ghostscript:check'),
  openPdfDialog: () => ipcRenderer.invoke('dialog:openPdf'),
  savePdfDialog: (defaultPath) => ipcRenderer.invoke('dialog:savePdf', defaultPath),
  getFileInfo: (filePath) => ipcRenderer.invoke('pdf:fileInfo', filePath),
  previewPdf: (payload) => ipcRenderer.invoke('pdf:preview', payload),
  compressPdf: (payload) => ipcRenderer.invoke('pdf:compress', payload),
  compressToTarget: (payload) => ipcRenderer.invoke('pdf:compressTarget', payload),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showItem', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getPathForFile: (file) => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('pdfDiet', api)
