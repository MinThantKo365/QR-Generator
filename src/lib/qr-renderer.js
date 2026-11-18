import QRCode from 'qrcode'

const QUIET_ZONE = 4
const DEFAULT_FOREGROUND = '#171512'
const DEFAULT_BACKGROUND = '#fffdf8'

function normalizeHex(value, fallback) {
  const candidate = String(value ?? '').trim()
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(candidate) ? candidate : fallback
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function finderOrigins(size) {
  return [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]
}

function isInsideFinder(row, column, size) {
  return finderOrigins(size).some(
    ([originRow, originColumn]) =>
      row >= originRow && row < originRow + 7 && column >= originColumn && column < originColumn + 7,
  )
}

/**
 * Create the raw QR matrix. QRCode.create is synchronous and runs entirely
 * in the browser, which keeps every value on the visitor's device.
 */
export function createQr(text, errorCorrectionLevel = 'Q') {
  if (!String(text ?? '').length) return null

  return QRCode.create(String(text), {
    errorCorrectionLevel,
  })
}

function renderOptions(options = {}) {
  return {
    foreground: normalizeHex(options.foreground, DEFAULT_FOREGROUND),
    background: normalizeHex(options.background, DEFAULT_BACKGROUND),
    transparent: Boolean(options.transparent),
    soft: options.moduleStyle !== 'square',
    label: options.label || 'QR code',
  }
}

/**
 * Build a hand-drawn SVG so the QR can use softly rounded modules and custom
 * eyes without relying on raster image tracing.
 */
export function buildQrSvg(qr, options = {}) {
  if (!qr?.modules) return ''

  const { foreground, background, transparent, soft, label } = renderOptions(options)
  const { size, data } = qr.modules
  const total = size + QUIET_ZONE * 2
  const radius = soft ? 0.22 : 0.04
  const inset = soft ? 0.015 : 0
  const moduleSize = 1 - inset * 2
  const pieces = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${total} ${total}" role="img" aria-label="${escapeXml(label)}" shape-rendering="geometricPrecision">`,
    `<title>${escapeXml(label)}</title>`,
  ]

  if (!transparent) {
    pieces.push(`<rect width="${total}" height="${total}" fill="${background}"/>`)
  }

  // Data modules, with the three finder patterns removed so they can be
  // rendered as clean rounded eyes below.
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!data[row * size + column] || isInsideFinder(row, column, size)) continue

      pieces.push(
        `<rect x="${(column + QUIET_ZONE + inset).toFixed(3)}" y="${(row + QUIET_ZONE + inset).toFixed(3)}" width="${moduleSize}" height="${moduleSize}" rx="${radius}" fill="${foreground}"/>`,
      )
    }
  }

  const eyeRadius = soft ? 1.75 : 0.35
  const pupilRadius = soft ? 0.9 : 0.25

  for (const [row, column] of finderOrigins(size)) {
    const x = column + QUIET_ZONE
    const y = row + QUIET_ZONE
    pieces.push(
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="${eyeRadius}" fill="none" stroke="${foreground}" stroke-width="1"/>`,
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${pupilRadius}" fill="${foreground}"/>`,
    )
  }

  pieces.push('</svg>')
  return pieces.join('')
}

export function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

/**
 * Render the same design into a high-resolution canvas for PNG export.
 */
export function drawQrToCanvas(qr, canvas, options = {}, pixelSize = 2048) {
  if (!qr?.modules || !canvas) return

  const { foreground, background, transparent, soft } = renderOptions(options)
  const { size, data } = qr.modules
  const total = size + QUIET_ZONE * 2
  const target = Math.max(256, Math.min(4096, Number(pixelSize) || 2048))

  canvas.width = target
  canvas.height = target

  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, target, target)
  context.save()
  context.scale(target / total, target / total)

  if (!transparent) {
    context.fillStyle = background
    context.fillRect(0, 0, total, total)
  }

  context.fillStyle = foreground
  const radius = soft ? 0.22 : 0.04
  const inset = soft ? 0.015 : 0
  const moduleSize = 1 - inset * 2

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!data[row * size + column] || isInsideFinder(row, column, size)) continue

      roundedRect(
        context,
        column + QUIET_ZONE + inset,
        row + QUIET_ZONE + inset,
        moduleSize,
        moduleSize,
        radius,
      )
      context.fill()
    }
  }

  context.lineWidth = 1
  context.strokeStyle = foreground

  for (const [row, column] of finderOrigins(size)) {
    const x = column + QUIET_ZONE
    const y = row + QUIET_ZONE

    roundedRect(context, x + 0.5, y + 0.5, 6, 6, soft ? 1.75 : 0.35)
    context.stroke()

    roundedRect(context, x + 2, y + 2, 3, 3, soft ? 0.9 : 0.25)
    context.fill()
  }

  context.restore()
}

export function createQrPngBlob(qr, options, pixelSize) {
  const canvas = document.createElement('canvas')
  drawQrToCanvas(qr, canvas, options, pixelSize)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The browser could not create the PNG image.'))
    }, 'image/png')
  })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()

  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadSvgFile(svg, filename) {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename)
}

function channelToLinear(channel) {
  const value = channel / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex) {
  const clean = String(hex).replace('#', '')
  const expanded =
    clean.length === 3
      ? clean
          .split('')
          .map((character) => character + character)
          .join('')
      : clean

  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)

  if ([red, green, blue].some(Number.isNaN)) return 0

  return 0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue)
}

export function contrastRatio(foreground, background = '#ffffff') {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}
