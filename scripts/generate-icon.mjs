import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const pngPath = path.join(root, 'build', 'icon-512.png')
const icoPath = path.join(root, 'build', 'icon.ico')

function createIco(pngBuffers) {
  const count = pngBuffers.length
  const headerSize = 6 + count * 16
  let offset = headerSize
  const entries = pngBuffers.map((buf) => {
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    const entry = { width, height, size: buf.length, offset }
    offset += buf.length
    return entry
  })

  const out = Buffer.alloc(offset)
  out.writeUInt16LE(0, 0)
  out.writeUInt16LE(1, 2)
  out.writeUInt16LE(count, 4)

  let pos = 6
  for (const entry of entries) {
    out.writeUInt8(entry.width === 256 ? 0 : entry.width, pos)
    out.writeUInt8(entry.height === 256 ? 0 : entry.height, pos + 1)
    out.writeUInt8(0, pos + 2)
    out.writeUInt8(0, pos + 3)
    out.writeUInt16LE(1, pos + 4)
    out.writeUInt16LE(32, pos + 6)
    out.writeUInt32LE(entry.size, pos + 8)
    out.writeUInt32LE(entry.offset, pos + 12)
    pos += 16
  }

  let imagePos = headerSize
  for (const buf of pngBuffers) {
    buf.copy(out, imagePos)
    imagePos += buf.length
  }

  return out
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map((size) => sharp(pngPath).resize(size, size).png().toBuffer()),
)

fs.writeFileSync(icoPath, createIco(pngBuffers))
console.log(`Created ${icoPath}`)
