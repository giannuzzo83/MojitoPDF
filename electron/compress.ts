import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { existsSync } from 'node:fs'

export type QualityPreset = 'ultra' | 'bassa' | 'media' | 'alta'

export type GhostscriptStatus = {
  available: boolean
  path: string | null
}

export type CompressOptions = {
  inputPath: string
  outputPath?: string
  preset: QualityPreset
  /** Flatten each page to a single JPEG image. Default true. */
  flatten?: boolean
}

export type TargetCompressOptions = {
  inputPath: string
  outputPath?: string
  targetBytes: number
  flatten?: boolean
}

export type CompressResult =
  | {
      ok: true
      inputPath: string
      outputPath: string
      originalBytes: number
      compressedBytes: number
      savedPercent: number
      preset?: QualityPreset
      targetBytes?: number
      targetReached?: boolean
      usedRaster?: boolean
    }
  | {
      ok: false
      error: string
      missingGhostscript?: boolean
    }

export type PreviewResult =
  | {
      ok: true
      originalBytes: number
      estimatedBytes: number
      savedPercent: number
      preset: QualityPreset
    }
  | {
      ok: false
      error: string
      missingGhostscript?: boolean
    }

export type FileInfoResult =
  | { ok: true; path: string; bytes: number }
  | { ok: false; error: string }

type CompressionLevel =
  | { kind: 'preset'; preset: QualityPreset; label: string }
  | { kind: 'custom'; dpi: number; qFactor: number; label: string }

/** Mild → aggressive ladder used to hit a target size. */
const TARGET_LADDER: CompressionLevel[] = [
  { kind: 'preset', preset: 'alta', label: 'alta' },
  { kind: 'preset', preset: 'media', label: 'media' },
  { kind: 'preset', preset: 'bassa', label: 'bassa' },
  { kind: 'preset', preset: 'ultra', label: 'ultra' },
  { kind: 'custom', dpi: 28, qFactor: 3.0, label: 'custom-28' },
  { kind: 'custom', dpi: 20, qFactor: 4.0, label: 'custom-20' },
  { kind: 'custom', dpi: 14, qFactor: 5.0, label: 'custom-14' },
  { kind: 'custom', dpi: 10, qFactor: 6.0, label: 'custom-10' },
]

const PRESET_TO_GS: Record<Exclude<QualityPreset, 'ultra'>, string> = {
  bassa: '/screen',
  media: '/ebook',
  alta: '/printer',
}

const ULTRA_ARGS = buildCustomImageArgs(36, 2.4)

function buildCustomImageArgs(dpi: number, qFactor: number): string[] {
  return [
    '-dPDFSETTINGS=/screen',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dDownsampleMonoImages=true',
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dMonoImageDownsampleType=/Bicubic',
    `-dColorImageResolution=${dpi}`,
    `-dGrayImageResolution=${dpi}`,
    `-dMonoImageResolution=${dpi}`,
    '-dColorImageDownsampleThreshold=1.0',
    '-dGrayImageDownsampleThreshold=1.0',
    '-dMonoImageDownsampleThreshold=1.0',
    '-dAutoFilterColorImages=false',
    '-dAutoFilterGrayImages=false',
    '-dColorImageFilter=/DCTEncode',
    '-dGrayImageFilter=/DCTEncode',
    '-dEncodeColorImages=true',
    '-dEncodeGrayImages=true',
    '-dEncodeMonoImages=true',
    '-c',
    `<< /ColorImageDict << /QFactor ${qFactor} /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >> /GrayImageDict << /QFactor ${qFactor} /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >> >> setdistillerparams`,
    '-f',
  ]
}

const GS_CANDIDATES = [
  'gswin64c',
  'gswin32c',
  'gs',
  'C:\\Program Files\\gs\\gs10.07.1\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.06.0\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.03.1\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.01.2\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs10.00.0\\bin\\gswin64c.exe',
  'C:\\Program Files\\gs\\gs9.56.1\\bin\\gswin64c.exe',
  'C:\\Program Files (x86)\\gs\\gs10.07.1\\bin\\gswin32c.exe',
  'C:\\Program Files (x86)\\gs\\gs10.05.1\\bin\\gswin32c.exe',
]

async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['-v'], {
      windowsHide: true,
      shell: false,
    })
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    child.on('error', () => done(false))
    child.on('close', (code) => done(code === 0 || code === null))
    setTimeout(() => {
      child.kill()
      done(false)
    }, 3000)
  })
}

async function discoverGsInProgramFiles(): Promise<string | null> {
  const roots = ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs']

  for (const root of roots) {
    if (!existsSync(root)) continue
    try {
      const entries = await fs.readdir(root, { withFileTypes: true })
      const versions = entries
        .filter((e) => e.isDirectory() && e.name.toLowerCase().startsWith('gs'))
        .map((e) => e.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

      for (const version of versions) {
        const exe64 = path.join(root, version, 'bin', 'gswin64c.exe')
        const exe32 = path.join(root, version, 'bin', 'gswin32c.exe')
        if (existsSync(exe64)) return exe64
        if (existsSync(exe32)) return exe32
      }
    } catch {
      // ignore
    }
  }
  return null
}

export async function findGhostscript(): Promise<string | null> {
  for (const candidate of GS_CANDIDATES) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    if (await commandExists(candidate)) return candidate
  }
  return discoverGsInProgramFiles()
}

function defaultOutputPath(inputPath: string): string {
  const dir = path.dirname(inputPath)
  const base = path.basename(inputPath, path.extname(inputPath))
  const cleaned = base.replace(/_diet$/i, '')
  return path.join(dir, `${cleaned}_diet.pdf`)
}

function savedPercent(originalBytes: number, compressedBytes: number): number {
  if (originalBytes === 0) return 0
  return Math.max(0, Math.round((1 - compressedBytes / originalBytes) * 1000) / 10)
}

function toGsPath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/')
}

function buildGhostscriptArgs(
  inputPath: string,
  outputPath: string,
  level: CompressionLevel,
): string[] {
  const out = toGsPath(outputPath)
  const input = toGsPath(inputPath)
  const common = [
    '-dNOPAUSE',
    '-dBATCH',
    '-dNOSAFER',
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    `-sOutputFile=${out}`,
  ]

  if (level.kind === 'custom') {
    return [...common, ...buildCustomImageArgs(level.dpi, level.qFactor), input]
  }

  if (level.preset === 'ultra') {
    return [...common, ...ULTRA_ARGS, input]
  }

  return [
    ...common,
    `-dPDFSETTINGS=${PRESET_TO_GS[level.preset]}`,
    ...ALWAYS_COMPRESS_IMAGES,
    input,
  ]
}

function runGsCommand(gsPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(gsPath, args, {
      windowsHide: true,
      shell: false,
    })

    let stderr = ''
    let stdout = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.on('error', (err) => {
      reject(new Error(`Impossibile avviare Ghostscript: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) resolve()
      else {
        const detail = [stderr, stdout].map((s) => s.trim()).filter(Boolean).join('\n')
        reject(
          new Error(
            detail ||
              `Ghostscript ha terminato con codice ${code ?? 'sconosciuto'}`,
          ),
        )
      }
    })
  })
}

function runGhostscript(
  gsPath: string,
  inputPath: string,
  outputPath: string,
  level: CompressionLevel,
): Promise<void> {
  return runGsCommand(gsPath, buildGhostscriptArgs(inputPath, outputPath, level))
}

async function compressWithLevel(
  gsPath: string,
  inputPath: string,
  outputPath: string,
  level: CompressionLevel,
): Promise<number> {
  const tempOutput = `${outputPath}.${Date.now()}.tmp.pdf`
  try {
    await runGhostscript(gsPath, inputPath, tempOutput, level)
    await fs.rename(tempOutput, outputPath).catch(async () => {
      await fs.copyFile(tempOutput, outputPath)
      await fs.unlink(tempOutput).catch(() => undefined)
    })
    const stat = await fs.stat(outputPath)
    return stat.size
  } catch (err) {
    await fs.unlink(tempOutput).catch(() => undefined)
    throw err
  }
}

/** Raster configs from milder → more aggressive (for hitting low MB targets). */
const RASTER_LADDER: { dpi: number; jpegq: number }[] = [
  { dpi: 110, jpegq: 55 },
  { dpi: 96, jpegq: 48 },
  { dpi: 85, jpegq: 42 },
  { dpi: 72, jpegq: 38 },
  { dpi: 72, jpegq: 30 },
  { dpi: 60, jpegq: 26 },
  { dpi: 50, jpegq: 22 },
  { dpi: 45, jpegq: 18 },
  { dpi: 40, jpegq: 14 },
  { dpi: 36, jpegq: 12 },
  { dpi: 30, jpegq: 10 },
  { dpi: 28, jpegq: 8 },
]

/** Preset → raster settings when flatten is enabled. */
const PRESET_RASTER: Record<QualityPreset, { dpi: number; jpegq: number }> = {
  alta: { dpi: 120, jpegq: 58 },
  media: { dpi: 85, jpegq: 42 },
  bassa: { dpi: 60, jpegq: 26 },
  ultra: { dpi: 36, jpegq: 12 },
}

/** Extra image-compression flags always applied in classic (non-flatten) mode. */
const ALWAYS_COMPRESS_IMAGES = [
  '-dDetectDuplicateImages=true',
  '-dCompressFonts=true',
  '-dSubsetFonts=true',
  '-dDownsampleColorImages=true',
  '-dDownsampleGrayImages=true',
  '-dDownsampleMonoImages=true',
  '-dColorImageDownsampleType=/Bicubic',
  '-dGrayImageDownsampleType=/Bicubic',
  '-dMonoImageDownsampleType=/Bicubic',
  '-dEncodeColorImages=true',
  '-dEncodeGrayImages=true',
  '-dEncodeMonoImages=true',
  '-dAutoFilterColorImages=false',
  '-dAutoFilterGrayImages=false',
  '-dColorImageFilter=/DCTEncode',
  '-dGrayImageFilter=/DCTEncode',
]

async function rasterizeViaJpeg(
  gsPath: string,
  inputPath: string,
  outputPath: string,
  dpi: number,
  jpegq: number,
): Promise<number> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfdiet-jpeg-'))
  const pattern = toGsPath(path.join(workDir, 'p-%04d.jpg'))
  const input = toGsPath(inputPath)
  const combinedPath = path.join(workDir, 'combined.pdf')
  const combined = toGsPath(combinedPath)

  try {
    await runGsCommand(gsPath, [
      '-dNOPAUSE',
      '-dBATCH',
      '-dNOSAFER',
      '-sDEVICE=jpeg',
      `-r${dpi}`,
      `-dJPEGQ=${jpegq}`,
      `-sOutputFile=${pattern}`,
      input,
    ])

    const pages = (await fs.readdir(workDir))
      .filter((name) => name.toLowerCase().endsWith('.jpg'))
      .sort()
      .map((name) => toGsPath(path.join(workDir, name)))

    if (pages.length === 0) {
      throw new Error('Impossibile rasterizzare le pagine del PDF.')
    }

    // Prefer direct argv (more reliable than @file on some GS Windows builds)
    const combineArgs = [
      '-dNOPAUSE',
      '-dBATCH',
      '-dNOSAFER',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-sOutputFile=${combined}`,
      ...pages,
    ]

    const argsSize = combineArgs.join(' ').length
    if (argsSize < 28000) {
      await runGsCommand(gsPath, combineArgs)
    } else {
      const argsFile = path.join(workDir, 'gs-args.txt')
      await fs.writeFile(argsFile, combineArgs.join('\n'), 'utf8')
      await runGsCommand(gsPath, [`@${toGsPath(argsFile)}`])
    }

    await fs.copyFile(combinedPath, outputPath)
    return (await fs.stat(outputPath)).size
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function rasterizeViaPdfImage(
  gsPath: string,
  inputPath: string,
  outputPath: string,
  dpi: number,
): Promise<number> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfdiet-img-'))
  const tempOut = path.join(workDir, 'out.pdf')

  try {
    await runGsCommand(gsPath, [
      '-dNOPAUSE',
      '-dBATCH',
      '-dNOSAFER',
      '-sDEVICE=pdfimage24',
      `-r${dpi}`,
      `-sOutputFile=${toGsPath(tempOut)}`,
      toGsPath(inputPath),
    ])
    await fs.copyFile(tempOut, outputPath)
    return (await fs.stat(outputPath)).size
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function rasterizePdf(
  gsPath: string,
  inputPath: string,
  outputPath: string,
  dpi: number,
  jpegq: number,
): Promise<number> {
  try {
    return await rasterizeViaJpeg(gsPath, inputPath, outputPath, dpi, jpegq)
  } catch (jpegError) {
    try {
      return await rasterizeViaPdfImage(gsPath, inputPath, outputPath, dpi)
    } catch {
      const message =
        jpegError instanceof Error ? jpegError.message : String(jpegError)
      throw new Error(message)
    }
  }
}

function presetToLevel(preset: QualityPreset): CompressionLevel {
  return { kind: 'preset', preset, label: preset }
}

export async function getFileInfo(filePath: string): Promise<FileInfoResult> {
  try {
    await fs.access(filePath)
    const stat = await fs.stat(filePath)
    return { ok: true, path: filePath, bytes: stat.size }
  } catch {
    return { ok: false, error: 'Il file PDF selezionato non esiste.' }
  }
}

export async function estimatePreview(
  inputPath: string,
  preset: QualityPreset,
  flatten = true,
): Promise<PreviewResult> {
  try {
    await fs.access(inputPath)
  } catch {
    return { ok: false, error: 'Il file PDF selezionato non esiste.' }
  }

  const gsPath = await findGhostscript()
  if (!gsPath) {
    return {
      ok: false,
      missingGhostscript: true,
      error: 'Ghostscript non trovato.',
    }
  }

  const originalBytes = (await fs.stat(inputPath)).size
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfdiet-preview-'))
  const tempOut = path.join(tempDir, 'preview.pdf')

  try {
    const estimatedBytes = flatten
      ? await rasterizePdf(
          gsPath,
          inputPath,
          tempOut,
          PRESET_RASTER[preset].dpi,
          PRESET_RASTER[preset].jpegq,
        )
      : await compressWithLevel(gsPath, inputPath, tempOut, presetToLevel(preset))

    return {
      ok: true,
      originalBytes,
      estimatedBytes,
      savedPercent: savedPercent(originalBytes, estimatedBytes),
      preset,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function compressPdf(options: CompressOptions): Promise<CompressResult> {
  const { inputPath, preset } = options
  const flatten = options.flatten !== false

  try {
    await fs.access(inputPath)
  } catch {
    return { ok: false, error: 'Il file PDF selezionato non esiste.' }
  }

  if (!inputPath.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: 'Seleziona un file con estensione .pdf.' }
  }

  const gsPath = await findGhostscript()
  if (!gsPath) {
    return {
      ok: false,
      missingGhostscript: true,
      error:
        'Ghostscript non trovato. Installalo e riprova, oppure aggiungi gswin64c al PATH.',
    }
  }

  const outputPath = options.outputPath ?? defaultOutputPath(inputPath)
  if (path.resolve(outputPath) === path.resolve(inputPath)) {
    return {
      ok: false,
      error: 'Il file di destinazione non può essere lo stesso del file originale.',
    }
  }

  const originalBytes = (await fs.stat(inputPath)).size

  try {
    const compressedBytes = flatten
      ? await rasterizePdf(
          gsPath,
          inputPath,
          outputPath,
          PRESET_RASTER[preset].dpi,
          PRESET_RASTER[preset].jpegq,
        )
      : await compressWithLevel(gsPath, inputPath, outputPath, presetToLevel(preset))

    return {
      ok: true,
      inputPath,
      outputPath,
      originalBytes,
      compressedBytes,
      savedPercent: savedPercent(originalBytes, compressedBytes),
      preset,
      usedRaster: flatten,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

/**
 * Hits a target size.
 * - flatten=true (default): search raster JPEG ladder
 * - flatten=false: classic pdfwrite with image compression; if needed still tries raster as last resort only when flatten is true
 */
export async function compressToTarget(
  options: TargetCompressOptions,
): Promise<CompressResult> {
  const { inputPath, targetBytes } = options
  const flatten = options.flatten !== false

  try {
    await fs.access(inputPath)
  } catch {
    return { ok: false, error: 'Il file PDF selezionato non esiste.' }
  }

  if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
    return { ok: false, error: 'Indica una dimensione target valida in MB.' }
  }

  const gsPath = await findGhostscript()
  if (!gsPath) {
    return {
      ok: false,
      missingGhostscript: true,
      error:
        'Ghostscript non trovato. Installalo e riprova, oppure aggiungi gswin64c al PATH.',
    }
  }

  const originalBytes = (await fs.stat(inputPath)).size
  if (targetBytes >= originalBytes) {
    return {
      ok: false,
      error: 'La dimensione target deve essere inferiore al file originale.',
    }
  }

  const outputPath = options.outputPath ?? defaultOutputPath(inputPath)
  if (path.resolve(outputPath) === path.resolve(inputPath)) {
    return {
      ok: false,
      error: 'Il file di destinazione non può essere lo stesso del file originale.',
    }
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdfdiet-target-'))
  let bestPath: string | null = null
  let bestBytes = Number.POSITIVE_INFINITY
  let usedRaster = false

  try {
    const track = (filePath: string, bytes: number, raster: boolean) => {
      if (bytes < bestBytes) {
        bestBytes = bytes
        bestPath = filePath
        usedRaster = raster
      }
    }

    // Classic path when not flattening (keep text selectable, still compress images)
    if (!flatten) {
      let lo = 0
      let hi = TARGET_LADDER.length - 1
      let meetIndex = -1
      const sizeCache = new Map<number, { path: string; bytes: number }>()

      const tryLevel = async (index: number) => {
        const cached = sizeCache.get(index)
        if (cached) return cached
        const level = TARGET_LADDER[index]!
        const out = path.join(tempDir, `level-${index}.pdf`)
        const bytes = await compressWithLevel(gsPath, inputPath, out, level)
        const entry = { path: out, bytes }
        sizeCache.set(index, entry)
        track(out, bytes, false)
        return entry
      }

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        const result = await tryLevel(mid)
        if (result.bytes <= targetBytes) {
          meetIndex = mid
          hi = mid - 1
        } else {
          lo = mid + 1
        }
      }

      if (meetIndex >= 0) {
        const meet = await tryLevel(meetIndex)
        await fs.copyFile(meet.path, outputPath)
        return {
          ok: true,
          inputPath,
          outputPath,
          originalBytes,
          compressedBytes: meet.bytes,
          savedPercent: savedPercent(originalBytes, meet.bytes),
          targetBytes,
          targetReached: true,
          usedRaster: false,
        }
      }

      await tryLevel(TARGET_LADDER.length - 1)
    }

    // Flatten path (default): rasterize pages to JPEG
    if (flatten) {
      let rLo = 0
      let rHi = RASTER_LADDER.length - 1
      let rMeet = -1
      const rasterCache = new Map<number, { path: string; bytes: number }>()

      const tryRaster = async (index: number) => {
        const cached = rasterCache.get(index)
        if (cached) return cached
        const cfg = RASTER_LADDER[index]!
        const out = path.join(tempDir, `raster-${index}.pdf`)
        const bytes = await rasterizePdf(gsPath, inputPath, out, cfg.dpi, cfg.jpegq)
        const entry = { path: out, bytes }
        rasterCache.set(index, entry)
        track(out, bytes, true)
        return entry
      }

      while (rLo <= rHi) {
        const mid = Math.floor((rLo + rHi) / 2)
        const result = await tryRaster(mid)
        if (result.bytes <= targetBytes) {
          rMeet = mid
          rHi = mid - 1
        } else {
          rLo = mid + 1
        }
      }

      if (rMeet >= 0) {
        const meet = await tryRaster(rMeet)
        await fs.copyFile(meet.path, outputPath)
        return {
          ok: true,
          inputPath,
          outputPath,
          originalBytes,
          compressedBytes: meet.bytes,
          savedPercent: savedPercent(originalBytes, meet.bytes),
          targetBytes,
          targetReached: true,
          usedRaster: true,
        }
      }

      await tryRaster(RASTER_LADDER.length - 1)
    }

    if (!bestPath) {
      return { ok: false, error: 'Compressione fallita: nessun risultato prodotto.' }
    }

    await fs.copyFile(bestPath, outputPath)
    return {
      ok: true,
      inputPath,
      outputPath,
      originalBytes,
      compressedBytes: bestBytes,
      savedPercent: savedPercent(originalBytes, bestBytes),
      targetBytes,
      targetReached: bestBytes <= targetBytes,
      usedRaster,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
