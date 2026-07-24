import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import type { CompressResult, QualityPreset } from '../electron/compress'

type AppPhase = 'idle' | 'compressing' | 'done' | 'error'
type Mode = 'preset' | 'target'

const PRESETS: { id: QualityPreset; label: string; hint: string }[] = [
  { id: 'ultra', label: 'Ultra', hint: 'Compressione estrema (~70%+), qualità ridotta' },
  { id: 'bassa', label: 'Bassa', hint: 'Forte riduzione, ideale per email' },
  { id: 'media', label: 'Media', hint: 'Bilanciato per uso quotidiano' },
  { id: 'alta', label: 'Alta', hint: 'Qualità più alta, meno compressione' },
]

const GS_DOWNLOAD = 'https://ghostscript.com/releases/gsdnld.html'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function mbToBytes(mb: number): number {
  return Math.round(mb * 1024 * 1024)
}

function fileName(filePath: string): string {
  return filePath.replace(/^.*[/\\]/, '')
}

function defaultDietPath(inputPath: string): string {
  const parts = inputPath.split(/[/\\]/)
  const name = parts.pop() ?? 'documento.pdf'
  const base = name.replace(/\.pdf$/i, '').replace(/_diet$/i, '')
  const folder = parts.join('\\')
  return `${folder}\\${base}_diet.pdf`
}

export default function App() {
  const [inputPath, setInputPath] = useState<string | null>(null)
  const [originalBytes, setOriginalBytes] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('preset')
  const [preset, setPreset] = useState<QualityPreset>('media')
  const [flatten, setFlatten] = useState(true)
  const [targetMb, setTargetMb] = useState('3')
  const [phase, setPhase] = useState<AppPhase>('idle')
  const [result, setResult] = useState<Extract<CompressResult, { ok: true }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gsAvailable, setGsAvailable] = useState<boolean | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    void window.pdfDiet.checkGhostscript().then((status) => {
      setGsAvailable(status.available)
    })
  }, [])

  const targetBytes = useMemo(() => {
    const mb = Number(targetMb.replace(',', '.'))
    if (!Number.isFinite(mb) || mb <= 0) return null
    return mbToBytes(mb)
  }, [targetMb])

  const loadFile = useCallback(async (path: string) => {
    setInputPath(path)
    setResult(null)
    setError(null)
    setPhase('idle')
    const info = await window.pdfDiet.getFileInfo(path)
    if (info.ok) {
      setOriginalBytes(info.bytes)
      const mb = Math.max(0.1, Math.round((info.bytes / (1024 * 1024)) * 0.3 * 10) / 10)
      setTargetMb(String(mb).replace('.', ','))
    } else {
      setOriginalBytes(null)
    }
  }, [])

  const canCompress =
    Boolean(inputPath) &&
    phase !== 'compressing' &&
    gsAvailable !== false &&
    (mode === 'preset' ||
      (targetBytes !== null && originalBytes !== null && targetBytes < originalBytes))

  const selectFile = useCallback(async () => {
    const path = await window.pdfDiet.openPdfDialog()
    if (!path) return
    await loadFile(path)
  }, [loadFile])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      setDragOver(false)
      const file = event.dataTransfer.files?.[0]
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError('Trascina un file PDF.')
        setPhase('error')
        return
      }
      let path = ''
      try {
        path = window.pdfDiet.getPathForFile(file)
      } catch {
        path = ''
      }
      if (!path) {
        setError('Impossibile leggere il percorso del file. Usa “Scegli file”.')
        setPhase('error')
        return
      }
      void loadFile(path)
    },
    [loadFile],
  )

  const compress = useCallback(
    async (chooseLocation: boolean) => {
      if (!inputPath) return
      setPhase('compressing')
      setError(null)

      let outputPath: string | undefined
      if (chooseLocation) {
        const chosen = await window.pdfDiet.savePdfDialog(defaultDietPath(inputPath))
        if (!chosen) {
          setPhase(result ? 'done' : 'idle')
          return
        }
        outputPath = chosen
      }

      const response =
        mode === 'target' && targetBytes
          ? await window.pdfDiet.compressToTarget({
              inputPath,
              outputPath,
              targetBytes,
              flatten,
            })
          : await window.pdfDiet.compressPdf({
              inputPath,
              outputPath,
              preset,
              flatten,
            })

      if (!response.ok) {
        setPhase('error')
        setError(response.error)
        if (response.missingGhostscript) setGsAvailable(false)
        setResult(null)
        return
      }

      setResult(response)
      setPhase('done')
    },
    [inputPath, preset, flatten, result, mode, targetBytes],
  )

  const statusLabel = useMemo(() => {
    if (gsAvailable === null) return 'Verifica Ghostscript…'
    if (gsAvailable === false) return 'Ghostscript non trovato'
    return 'Ghostscript pronto'
  }, [gsAvailable])

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden />
      <header className="header">
        <p className="brand">PDFDiet</p>
        <p className="tagline">Alleggerisci i PDF senza lasciare il tuo PC</p>
      </header>

      <main className="main">
        {gsAvailable === false && (
          <aside className="banner banner-warn" role="alert">
            <p>
              Serve <strong>Ghostscript</strong> per comprimere i PDF. Installalo, poi riavvia
              l’app.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void window.pdfDiet.openExternal(GS_DOWNLOAD)}
            >
              Scarica Ghostscript
            </button>
          </aside>
        )}

        <section
          className={`dropzone ${dragOver ? 'dropzone-active' : ''} ${inputPath ? 'dropzone-filled' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {inputPath ? (
            <>
              <p className="drop-title">{fileName(inputPath)}</p>
              <p className="drop-path">{inputPath}</p>
              {originalBytes !== null && (
                <p className="drop-size">
                  Dimensione attuale: <strong>{formatBytes(originalBytes)}</strong>
                </p>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => void selectFile()}>
                Cambia file
              </button>
            </>
          ) : (
            <>
              <p className="drop-title">Trascina qui un PDF</p>
              <p className="drop-hint">oppure</p>
              <button type="button" className="btn btn-secondary" onClick={() => void selectFile()}>
                Scegli file
              </button>
            </>
          )}
        </section>

        <section className="mode-section" aria-label="Modalità compressione">
          <h2 className="section-title">Modalità</h2>
          <div className="mode-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'preset'}
              className={`mode-btn ${mode === 'preset' ? 'mode-active' : ''}`}
              onClick={() => setMode('preset')}
              disabled={phase === 'compressing'}
            >
              Preset qualità
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'target'}
              className={`mode-btn ${mode === 'target' ? 'mode-active' : ''}`}
              onClick={() => setMode('target')}
              disabled={phase === 'compressing'}
            >
              Dimensione target
            </button>
          </div>

          <label className={`flatten-check ${flatten ? 'flatten-on' : ''}`}>
            <input
              type="checkbox"
              checked={flatten}
              disabled={phase === 'compressing'}
              onChange={(e) => setFlatten(e.target.checked)}
            />
            <span>
              <strong>Appiattisci in un’unica immagine</strong>
              <small>
                {flatten
                  ? 'Ogni pagina diventa un’immagine JPEG (testo non selezionabile). Consigliato per ridurre di più.'
                  : 'Mantieni testo selezionabile e comprimi solo le immagini incorporate.'}
              </small>
            </span>
          </label>
        </section>

        {mode === 'preset' ? (
          <section className="presets" aria-label="Qualità compressione">
            <h2 className="section-title">Qualità</h2>
            <div className="preset-grid" role="radiogroup" aria-label="Preset qualità">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={preset === item.id}
                  className={`preset ${preset === item.id ? 'preset-active' : ''}`}
                  onClick={() => setPreset(item.id)}
                  disabled={phase === 'compressing'}
                >
                  <span className="preset-label">{item.label}</span>
                  <span className="preset-hint">{item.hint}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="target-section" aria-label="Dimensione target">
            <h2 className="section-title">Dimensione finale desiderata</h2>
            <label className="target-field">
              <span>MB</span>
              <input
                type="text"
                inputMode="decimal"
                value={targetMb}
                disabled={phase === 'compressing'}
                onChange={(e) => setTargetMb(e.target.value.replace(/[^\d.,]/g, ''))}
                aria-label="Dimensione target in megabyte"
                placeholder="es. 1,5"
              />
            </label>
            {originalBytes !== null && (
              <p className="preview-hint">
                Originale: {formatBytes(originalBytes)}
                {targetBytes ? ` → obiettivo ${formatBytes(targetBytes)}` : ''}
                {targetBytes && originalBytes && targetBytes >= originalBytes
                  ? ' — il target deve essere minore dell’originale.'
                  : ''}
              </p>
            )}
          </section>
        )}

        <section className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canCompress}
            onClick={() => void compress(false)}
          >
            {phase === 'compressing'
              ? mode === 'target'
                ? 'Cerco la qualità…'
                : 'Compressione…'
              : 'Comprimi'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canCompress}
            onClick={() => void compress(true)}
          >
            Scegli dove salvare…
          </button>
        </section>

        {phase === 'compressing' && (
          <div className="progress" role="status" aria-live="polite">
            <div className="progress-bar" />
            <p>
              {mode === 'target'
                ? flatten
                  ? 'Provo diversi livelli JPEG per avvicinarmi al target…'
                  : 'Provo diversi livelli di compressione immagini…'
                : 'Sto alleggerendo il documento…'}
            </p>
          </div>
        )}

        {phase === 'error' && error && (
          <aside className="banner banner-error" role="alert">
            <p>{error}</p>
          </aside>
        )}

        {phase === 'done' && result && (
          <section className="result" aria-live="polite">
            <h2 className="section-title">Risultato</h2>
            <div className="result-stats">
              <div>
                <span className="stat-label">Originale</span>
                <span className="stat-value">{formatBytes(result.originalBytes)}</span>
              </div>
              <div className="stat-arrow" aria-hidden>
                →
              </div>
              <div>
                <span className="stat-label">Compresso</span>
                <span className="stat-value">{formatBytes(result.compressedBytes)}</span>
              </div>
              <div>
                <span className="stat-label">Risparmio</span>
                <span className="stat-value accent">{result.savedPercent}%</span>
              </div>
            </div>
            {typeof result.targetReached === 'boolean' && (
              <p className={`target-status ${result.targetReached ? 'ok' : 'warn'}`}>
                {result.targetReached
                  ? `Target raggiunto (≤ ${formatBytes(result.targetBytes ?? 0)}).`
                  : `Target non raggiunto: il minimo ottenibile è ${formatBytes(result.compressedBytes)}.`}
              </p>
            )}
            {result.usedRaster && (
              <p className="preview-hint">
                Usata compressione aggressiva (pagine come immagini): il testo non sarà
                selezionabile.
              </p>
            )}
            <p className="result-path">{result.outputPath}</p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void window.pdfDiet.showInFolder(result.outputPath)}
              >
                Apri cartella
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPhase('idle')
                  setResult(null)
                }}
              >
                Comprimi di nuovo
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span className={`status-dot ${gsAvailable ? 'ok' : gsAvailable === false ? 'bad' : ''}`} />
        {statusLabel}
      </footer>
    </div>
  )
}
