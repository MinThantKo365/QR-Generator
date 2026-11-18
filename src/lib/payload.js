const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Add https:// when the visitor types a bare domain.
 * Existing schemes are preserved so we can reject non-web links cleanly.
 */
export function normalizeUrl(rawValue) {
  const value = String(rawValue ?? '').trim()

  if (!value) return ''
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value
  return `https://${value}`
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value ?? '').trim())
}

/**
 * Escape the characters the Wi-Fi QR specification treats as syntax.
 * https://github.com/zxing/zxing/wiki/Barcode-Contents#wi-fi-network-config-android-ios-11
 */
export function escapeWifiValue(value) {
  return String(value ?? '').replace(/([\\;,:"])/g, '\\$1')
}

export function buildWifiPayload({ ssid = '', password = '', encryption = 'WPA', hidden = false } = {}) {
  const networkName = String(ssid).trim()

  if (!networkName) {
    return { value: '', issue: 'Add the Wi-Fi network name to continue.' }
  }

  const type = encryption === 'nopass' ? 'nopass' : encryption
  const parts = [`T:${type}`, `S:${escapeWifiValue(networkName)}`]

  if (type !== 'nopass' && password) {
    parts.push(`P:${escapeWifiValue(password)}`)
  }

  if (hidden) parts.push('H:true')

  return { value: `WIFI:${parts.join(';')};;`, issue: '' }
}

export function buildEmailPayload({ to = '', subject = '', message = '' } = {}) {
  const recipient = String(to).trim()

  if (!recipient) {
    return { value: '', issue: 'Add a recipient to create an email code.' }
  }

  if (!isValidEmail(recipient)) {
    return { value: '', issue: 'That email address does not look right.' }
  }

  const query = []

  if (String(subject).trim()) query.push(`subject=${encodeURIComponent(subject)}`)
  if (String(message).trim()) query.push(`body=${encodeURIComponent(message)}`)

  const safeRecipient = encodeURIComponent(recipient).replace(/%40/g, '@')
  return {
    value: `mailto:${safeRecipient}${query.length ? `?${query.join('&')}` : ''}`,
    issue: '',
  }
}

/**
 * Turn the active form state into the exact string stored in the QR code.
 * An empty value always includes a helpful issue for the UI.
 */
export function buildPayload(type, form) {
  switch (type) {
    case 'link': {
      const normalized = normalizeUrl(form?.link?.url)
      if (!normalized) return { value: '', issue: 'Add a destination URL to generate your code.' }
      if (!isHttpUrl(normalized)) {
        return { value: '', issue: 'Use a web address, like https://example.com.' }
      }
      return { value: normalized, issue: '' }
    }

    case 'text': {
      const value = String(form?.text?.value ?? '')
      if (!value.trim()) return { value: '', issue: 'Write a note to put inside your code.' }
      return { value, issue: '' }
    }

    case 'wifi':
      return buildWifiPayload(form?.wifi)

    case 'email':
      return buildEmailPayload(form?.email)

    default:
      return { value: '', issue: 'Choose a content type to get started.' }
  }
}
