/**
 * Generates PWA icons for the driver app using pngjs (Node 20 compatible).
 * Outputs: public/icon-192.png, public/icon-512.png, public/icon-512-maskable.png, public/splash-640x1136.png
 *
 * Run once: node scripts/gen-icons.mjs
 */
import { PNG } from 'pngjs'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../public')

mkdirSync(publicDir, { recursive: true })

/** Create a PNG filled with a solid color */
function createPng(width, height) {
  const png = new PNG({ width, height })
  png.data = Buffer.alloc(width * height * 4, 0)
  return png
}

/** Set pixel RGBA */
function setPixel(png, x, y, r, g, b, a = 255) {
  const idx = (png.width * y + x) * 4
  png.data[idx] = r
  png.data[idx + 1] = g
  png.data[idx + 2] = b
  png.data[idx + 3] = a
}

/** Fill a rectangle */
function fillRect(png, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x >= 0 && y >= 0 && x < png.width && y < png.height) {
        setPixel(png, x, y, r, g, b, a)
      }
    }
  }
}

/** Draw a circle */
function fillCircle(png, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        setPixel(png, x, y, r, g, b, a)
      }
    }
  }
}

/**
 * Draw a taxi glyph: yellow cab silhouette on dark background.
 * The glyph is a simplified taxi icon drawn with rectangles.
 */
function drawTaxiGlyph(png) {
  const w = png.width
  const h = png.height

  // Background - dark navy
  fillRect(png, 0, 0, w, h, 30, 42, 74)

  // Taxi yellow color
  const ty = 220, tg = 185, tb = 30
  // Dark color for windows/wheels
  const dr = 30, dg = 42, db = 74

  // Car body - main rectangle
  const bodyX = Math.floor(w * 0.12)
  const bodyY = Math.floor(h * 0.42)
  const bodyW = Math.floor(w * 0.76)
  const bodyH = Math.floor(h * 0.28)
  fillRect(png, bodyX, bodyY, bodyX + bodyW, bodyY + bodyH, ty, tg, tb)

  // Car roof/cabin - smaller rectangle on top, slightly inset
  const roofX = Math.floor(w * 0.26)
  const roofY = Math.floor(h * 0.26)
  const roofW = Math.floor(w * 0.50)
  const roofH = Math.floor(h * 0.18)
  fillRect(png, roofX, roofY, roofX + roofW, roofY + roofH, ty, tg, tb)

  // Front window (dark)
  const fwX = Math.floor(w * 0.56)
  const fwY = Math.floor(h * 0.28)
  const fwW = Math.floor(w * 0.16)
  const fwH = Math.floor(h * 0.14)
  fillRect(png, fwX, fwY, fwX + fwW, fwY + fwH, dr, dg, db)

  // Rear window (dark)
  const rwX = Math.floor(w * 0.28)
  const rwY = Math.floor(h * 0.28)
  const rwW = Math.floor(w * 0.16)
  const rwH = Math.floor(h * 0.14)
  fillRect(png, rwX, rwY, rwX + rwW, rwY + rwH, dr, dg, db)

  // Front wheel
  const fw1x = Math.floor(w * 0.68)
  const fw1y = Math.floor(h * 0.67)
  fillCircle(png, fw1x, fw1y, Math.floor(w * 0.09), dr, dg, db)
  fillCircle(png, fw1x, fw1y, Math.floor(w * 0.05), ty, tg, tb)

  // Rear wheel
  const fw2x = Math.floor(w * 0.32)
  const fw2y = Math.floor(h * 0.67)
  fillCircle(png, fw2x, fw2y, Math.floor(w * 0.09), dr, dg, db)
  fillCircle(png, fw2x, fw2y, Math.floor(w * 0.05), ty, tg, tb)

  // Taxi sign on roof
  const signX = Math.floor(w * 0.38)
  const signY = Math.floor(h * 0.20)
  const signW = Math.floor(w * 0.24)
  const signH = Math.floor(h * 0.07)
  fillRect(png, signX, signY, signX + signW, signY + signH, 255, 220, 50)
}

function generateIcon(size, outputPath, maskable = false) {
  const png = createPng(size, size)

  if (maskable) {
    // Maskable: safe zone is 80% center — fill entire background
    fillRect(png, 0, 0, size, size, 30, 42, 74)
  }

  drawTaxiGlyph(png)

  const buffer = PNG.sync.write(png)
  writeFileSync(outputPath, buffer)
  console.log(`Generated ${outputPath} (${size}x${size})`)
}

function generateSplash(width, height, outputPath) {
  const png = createPng(width, height)

  // Background
  fillRect(png, 0, 0, width, height, 30, 42, 74)

  // Draw a centered 192x192 taxi icon
  const iconSize = 192
  const offsetX = Math.floor((width - iconSize) / 2)
  const offsetY = Math.floor((height - iconSize) / 2) - 40

  const tempPng = createPng(iconSize, iconSize)
  drawTaxiGlyph(tempPng)

  // Blit tempPng into png at offset
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const srcIdx = (iconSize * y + x) * 4
      const dstX = offsetX + x
      const dstY = offsetY + y
      if (dstX >= 0 && dstY >= 0 && dstX < width && dstY < height) {
        const dstIdx = (width * dstY + dstX) * 4
        png.data[dstIdx] = tempPng.data[srcIdx]
        png.data[dstIdx + 1] = tempPng.data[srcIdx + 1]
        png.data[dstIdx + 2] = tempPng.data[srcIdx + 2]
        png.data[dstIdx + 3] = tempPng.data[srcIdx + 3]
      }
    }
  }

  const buffer = PNG.sync.write(png)
  writeFileSync(outputPath, buffer)
  console.log(`Generated ${outputPath} (${width}x${height})`)
}

generateIcon(192, join(publicDir, 'icon-192.png'))
generateIcon(512, join(publicDir, 'icon-512.png'))
generateIcon(512, join(publicDir, 'icon-512-maskable.png'), true)
generateSplash(640, 1136, join(publicDir, 'splash-640x1136.png'))

console.log('All icons generated successfully.')
