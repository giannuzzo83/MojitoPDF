/// <reference types="vite/client" />

import type { PdfDietApi } from '../electron/preload'

declare global {
  interface Window {
    pdfDiet: PdfDietApi
  }
}

export {}
