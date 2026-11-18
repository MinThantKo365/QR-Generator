<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Link2,
  LockKeyhole,
  Mail,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Type,
  Wifi,
} from '@lucide/vue'
import { buildPayload } from './lib/payload'
import {
  buildQrSvg,
  contrastRatio,
  createQr,
  createQrPngBlob,
  downloadBlob,
  downloadSvgFile,
  svgToDataUrl,
} from './lib/qr-renderer'

const contentTypes = [
  { id: 'link', label: 'Link', icon: Link2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { id: 'email', label: 'Email', icon: Mail },
]

const foregroundPresets = ['#171512', '#234f3d', '#1f3f77', '#c94b25']
const backgroundPresets = ['#fffdf8', '#f3eadc', '#e6efe2', '#f9e5dd']

const activeType = ref('link')
const touched = ref(false)
const showPassword = ref(false)
const toast = ref('')
const isExporting = ref(false)
const tabButtons = ref([])

const fields = reactive({
  link: { url: 'https://vuejs.org' },
  text: { value: 'A small square with somewhere to go.' },
  wifi: { ssid: 'Studio Guest', password: '', encryption: 'WPA', hidden: false },
  email: { to: 'hello@example.com', subject: 'Hello from QR Studio', message: '' },
})

const design = reactive({
  foreground: '#171512',
  background: '#fffdf8',
  transparent: false,
  moduleStyle: 'soft',
  ecc: 'Q',
  pngSize: 2048,
})

const defaults = {
  foreground: '#171512',
  background: '#fffdf8',
  transparent: false,
  moduleStyle: 'soft',
  ecc: 'Q',
  pngSize: 2048,
}

const typeLabel = computed(
  () => contentTypes.find((type) => type.id === activeType.value)?.label ?? 'QR',
)

const payloadResult = computed(() => buildPayload(activeType.value, fields))
const payload = computed(() => payloadResult.value.value)

const qrState = computed(() => {
  if (!payload.value) return { qr: null, error: '' }

  try {
    return { qr: createQr(payload.value, design.ecc), error: '' }
  } catch {
    return {
      qr: null,
      error: 'That is more content than one QR code can hold. Try shortening it a little.',
    }
  }
})

const qr = computed(() => qrState.value.qr)
const qrError = computed(() => qrState.value.error)
const qrVersion = computed(() => qr.value?.version ?? null)
const moduleCount = computed(() => qr.value?.modules?.size ?? null)

const renderOptions = computed(() => ({
  foreground: design.foreground,
  background: design.background,
  transparent: design.transparent,
  moduleStyle: design.moduleStyle,
  label: `QR code for ${typeLabel.value.toLowerCase()} content`,
}))

const svg = computed(() => (qr.value ? buildQrSvg(qr.value, renderOptions.value) : ''))
const qrDataUrl = computed(() => (svg.value ? svgToDataUrl(svg.value) : ''))

const contrast = computed(() =>
  contrastRatio(design.foreground, design.transparent ? '#ffffff' : design.background),
)
const lowContrast = computed(() => Boolean(qr.value) && contrast.value < 3.5)
const emptyMessage = computed(
  () => qrError.value || payloadResult.value.issue || 'Your code will appear here.',
)

const contentSummary = computed(() => {
  if (!payload.value) return 'Waiting for content'

  if (activeType.value === 'wifi') {
    const network = fields.wifi.ssid.trim() || 'Untitled network'
    const security = fields.wifi.encryption === 'nopass' ? 'Open network' : fields.wifi.encryption
    return `${network} · ${security}`
  }

  if (activeType.value === 'email') {
    return `Email to ${fields.email.to.trim()}`
  }

  return payload.value.replace(/\s+/g, ' ').trim()
})

const helperText = computed(() => {
  switch (activeType.value) {
    case 'link':
      return 'No https://? We will add it for you.'
    case 'text':
      return 'Plain text that works with any scanner.'
    case 'wifi':
      return 'Join the network without typing the password.'
    case 'email':
      return 'Opens a pre-filled draft in the scanner’s mail app.'
    default:
      return ''
  }
})

watch(activeType, () => {
  touched.value = false
  showPassword.value = false
})

let toastTimer

function notify(message) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 2600)
}

onBeforeUnmount(() => window.clearTimeout(toastTimer))

function handleTabKeydown(event, index) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
  if (!keys.includes(event.key)) return

  event.preventDefault()

  let nextIndex = index

  if (event.key === 'ArrowRight') nextIndex = (index + 1) % contentTypes.length
  if (event.key === 'ArrowLeft') nextIndex = (index - 1 + contentTypes.length) % contentTypes.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = contentTypes.length - 1

  activeType.value = contentTypes[nextIndex].id
  requestAnimationFrame(() => tabButtons.value[nextIndex]?.focus())
}

function isColor(value, preset) {
  return String(value).toLowerCase() === preset.toLowerCase()
}

function setBackground(color) {
  design.background = color
  design.transparent = false
}

function resetStyle() {
  Object.assign(design, defaults)
  notify('Style reset')
}

function fileStem() {
  return `qr-${activeType.value}-${new Date().toISOString().slice(0, 10)}`
}

async function downloadPng() {
  if (!qr.value || isExporting.value) return

  isExporting.value = true

  try {
    const blob = await createQrPngBlob(qr.value, renderOptions.value, design.pngSize)
    downloadBlob(blob, `${fileStem()}-${design.pngSize}.png`)
    notify(`PNG saved · ${design.pngSize} × ${design.pngSize}px`)
  } catch (error) {
    console.error(error)
    notify('Could not create the PNG. Please try again.')
  } finally {
    isExporting.value = false
  }
}

function downloadSvg() {
  if (!svg.value) return

  downloadSvgFile(svg.value, `${fileStem()}.svg`)
  notify('SVG saved')
}

function legacyCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function copyPayload() {
  if (!payload.value) return

  try {
    await navigator.clipboard.writeText(payload.value)
    notify('Encoded content copied')
  } catch {
    try {
      legacyCopy(payload.value)
      notify('Encoded content copied')
    } catch {
      notify('Copy failed — select the content manually.')
    }
  }
}
</script>

<template>
  <div id="top" class="page">
    <header class="site-header">
      <a class="brand" href="#top" aria-label="QR Studio home">
        <span class="brand-mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="brand-name">QR <em>Studio</em></span>
      </a>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">
            <span class="eyebrow-line" aria-hidden="true"></span>
            QR Studio
            <span class="eyebrow-slash">/</span>
            Est. 2026
          </p>

          <h1 id="hero-title">
            Make anything
            <br />
            <em>scannable.</em>
          </h1>

          <p class="hero-lede">
            Turn links, notes, Wi-Fi networks and email drafts into crisp QR codes. Made to look good,
            built to scan, and never uploaded anywhere.
          </p>

          <div class="hero-badges" aria-label="Highlights">
            <span><Check :size="14" :stroke-width="2.4" aria-hidden="true" /> Free to use</span>
            <span><Check :size="14" :stroke-width="2.4" aria-hidden="true" /> No sign-up</span>
          </div>
        </div>

        <aside class="hero-aside" aria-label="About the studio">
          <Sparkles class="aside-spark" :size="22" :stroke-width="1.5" aria-hidden="true" />
          <p class="aside-kicker">Small square.<br />Big doorway.</p>
          <div class="aside-stats">
            <div>
              <strong>04</strong>
              <span>content types</span>
            </div>
            <div>
              <strong>02</strong>
              <span>export formats</span>
            </div>
            <div>
              <strong>100<sup>%</sup></strong>
              <span>Free to use</span>
            </div>
          </div>
          <p class="aside-note">Every scan starts with a single, well-made square.</p>
        </aside>
      </section>

      <div class="section-rule" aria-hidden="true">
        <span>The studio</span>
        <span class="rule"></span>
        <span>Generate · scannable</span>
      </div>

      <section id="studio" class="studio-grid" aria-label="QR code studio">
        <div class="panel">
          <div class="panel-section">
            <div class="panel-heading">
              <span class="step">01</span>
              <div>
                <h2>Content</h2>
                <p>What should the code open?</p>
              </div>
            </div>

            <div class="type-tabs" role="tablist" aria-label="Content type">
              <button
                v-for="(type, index) in contentTypes"
                :id="`tab-${type.id}`"
                :key="type.id"
                :ref="(element) => (tabButtons[index] = element)"
                class="type-tab"
                :class="{ active: activeType === type.id }"
                type="button"
                role="tab"
                :aria-selected="activeType === type.id"
                :aria-controls="`panel-${type.id}`"
                :tabindex="activeType === type.id ? 0 : -1"
                @click="activeType = type.id"
                @keydown="handleTabKeydown($event, index)"
              >
                <component :is="type.icon" :size="16" :stroke-width="1.9" aria-hidden="true" />
                <span>{{ type.label }}</span>
              </button>
            </div>

            <Transition name="form-swap" mode="out-in">
              <div
                :id="`panel-${activeType}`"
                :key="activeType"
                class="form-fields"
                role="tabpanel"
                :aria-labelledby="`tab-${activeType}`"
              >
                <template v-if="activeType === 'link'">
                  <div class="field">
                    <label class="field-label" for="link-url">Destination URL</label>
                    <div class="field-control">
                      <Link2 class="field-icon" :size="17" :stroke-width="1.8" aria-hidden="true" />
                      <input
                        id="link-url"
                        v-model="fields.link.url"
                        type="text"
                        inputmode="url"
                        autocomplete="url"
                        spellcheck="false"
                        placeholder="your-site.com"
                        @input="touched = true"
                      />
                    </div>
                  </div>
                </template>

                <template v-else-if="activeType === 'text'">
                  <div class="field">
                    <label class="field-label" for="text-value">Your note</label>
                    <div class="field-control textarea-control">
                      <textarea
                        id="text-value"
                        v-model="fields.text.value"
                        rows="5"
                        placeholder="Write something worth scanning…"
                        @input="touched = true"
                      ></textarea>
                    </div>
                    <div class="field-meta">
                      <span>{{ fields.text.value.length }} characters</span>
                      <span>Best kept short and sweet</span>
                    </div>
                  </div>
                </template>

                <template v-else-if="activeType === 'wifi'">
                  <div class="field-grid">
                    <div class="field">
                      <label class="field-label" for="wifi-ssid">Network name</label>
                      <div class="field-control">
                        <Wifi class="field-icon" :size="17" :stroke-width="1.8" aria-hidden="true" />
                        <input
                          id="wifi-ssid"
                          v-model="fields.wifi.ssid"
                          type="text"
                          autocomplete="off"
                          placeholder="Studio Guest"
                          @input="touched = true"
                        />
                      </div>
                    </div>

                    <div class="field">
                      <label class="field-label" for="wifi-password">Password</label>
                      <div class="field-control">
                        <input
                          id="wifi-password"
                          v-model="fields.wifi.password"
                          :type="showPassword ? 'text' : 'password'"
                          autocomplete="new-password"
                          placeholder="Leave blank if open"
                          @input="touched = true"
                        />
                        <button
                          class="inline-button"
                          type="button"
                          :aria-label="showPassword ? 'Hide password' : 'Show password'"
                          @click="showPassword = !showPassword"
                        >
                          <EyeOff v-if="showPassword" :size="17" aria-hidden="true" />
                          <Eye v-else :size="17" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="field">
                    <label class="field-label" for="wifi-encryption">Security</label>
                    <div class="field-control select-control">
                      <select
                        id="wifi-encryption"
                        v-model="fields.wifi.encryption"
                        @change="touched = true"
                      >
                        <option value="WPA">WPA / WPA2 / WPA3</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">Open network</option>
                      </select>
                      <ChevronDown class="select-chevron" :size="16" aria-hidden="true" />
                    </div>
                  </div>

                  <label class="check-field">
                    <input
                      v-model="fields.wifi.hidden"
                      type="checkbox"
                      @change="touched = true"
                    />
                    <span class="check-ui" aria-hidden="true">
                      <Check :size="13" :stroke-width="3" />
                    </span>
                    <span class="check-copy">
                      <strong>Hidden network</strong>
                      <small>Use this when the SSID is not broadcast.</small>
                    </span>
                  </label>
                </template>

                <template v-else>
                  <div class="field">
                    <label class="field-label" for="email-to">Recipient</label>
                    <div class="field-control">
                      <Mail class="field-icon" :size="17" :stroke-width="1.8" aria-hidden="true" />
                      <input
                        id="email-to"
                        v-model="fields.email.to"
                        type="email"
                        autocomplete="email"
                        placeholder="hello@example.com"
                        @input="touched = true"
                      />
                    </div>
                  </div>

                  <div class="field">
                    <label class="field-label" for="email-subject">Subject</label>
                    <div class="field-control">
                      <input
                        id="email-subject"
                        v-model="fields.email.subject"
                        type="text"
                        placeholder="A note from QR Studio"
                        @input="touched = true"
                      />
                    </div>
                  </div>

                  <div class="field">
                    <label class="field-label" for="email-message">Message</label>
                    <div class="field-control textarea-control">
                      <textarea
                        id="email-message"
                        v-model="fields.email.message"
                        rows="4"
                        placeholder="Optional message…"
                        @input="touched = true"
                      ></textarea>
                    </div>
                  </div>
                </template>

                <p v-if="touched && payloadResult.issue" class="form-hint is-error" role="status">
                  <AlertTriangle :size="15" aria-hidden="true" />
                  {{ payloadResult.issue }}
                </p>
                <p v-else class="form-hint">{{ helperText }}</p>
              </div>
            </Transition>
          </div>

          <div class="panel-section style-section">
            <div class="panel-heading">
              <span class="step">02</span>
              <div>
                <h2>Style</h2>
                <p>Dial in the details.</p>
              </div>
              <button class="text-button" type="button" @click="resetStyle">
                <RotateCcw :size="14" :stroke-width="2" aria-hidden="true" />
                Reset
              </button>
            </div>

            <div class="color-grid">
              <div class="color-block">
                <div class="color-heading">
                  <span class="field-label">Foreground</span>
                  <code>{{ design.foreground.toUpperCase() }}</code>
                </div>
                <div class="swatch-row">
                  <button
                    v-for="color in foregroundPresets"
                    :key="color"
                    class="swatch"
                    :class="{ active: isColor(design.foreground, color) }"
                    :style="{ '--swatch-color': color }"
                    type="button"
                    :aria-label="`Use ${color} as the foreground color`"
                    :aria-pressed="isColor(design.foreground, color)"
                    @click="design.foreground = color"
                  ></button>
                  <label class="color-picker" title="Choose a custom foreground color">
                    <span class="color-picker-rainbow" aria-hidden="true"></span>
                    <span class="color-picker-plus" aria-hidden="true">+</span>
                    <input v-model="design.foreground" type="color" aria-label="Custom foreground color" />
                  </label>
                </div>
              </div>

              <div class="color-block">
                <div class="color-heading">
                  <span class="field-label">Background</span>
                  <code>{{ design.transparent ? 'TRANSPARENT' : design.background.toUpperCase() }}</code>
                </div>
                <div class="swatch-row">
                  <button
                    v-for="color in backgroundPresets"
                    :key="color"
                    class="swatch"
                    :class="{ active: !design.transparent && isColor(design.background, color) }"
                    :style="{ '--swatch-color': color }"
                    type="button"
                    :aria-label="`Use ${color} as the background color`"
                    :aria-pressed="!design.transparent && isColor(design.background, color)"
                    @click="setBackground(color)"
                  ></button>
                  <label class="color-picker" title="Choose a custom background color">
                    <span class="color-picker-rainbow" aria-hidden="true"></span>
                    <span class="color-picker-plus" aria-hidden="true">+</span>
                    <input
                      v-model="design.background"
                      type="color"
                      aria-label="Custom background color"
                      @input="design.transparent = false"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div class="option-grid">
              <div class="option-block">
                <span class="field-label">Module shape</span>
                <div class="shape-toggle" role="group" aria-label="Module shape">
                  <button
                    class="shape-button"
                    :class="{ active: design.moduleStyle === 'soft' }"
                    type="button"
                    :aria-pressed="design.moduleStyle === 'soft'"
                    @click="design.moduleStyle = 'soft'"
                  >
                    <span class="shape-icon is-soft" aria-hidden="true">
                      <i v-for="index in 4" :key="index"></i>
                    </span>
                    Soft
                  </button>
                  <button
                    class="shape-button"
                    :class="{ active: design.moduleStyle === 'square' }"
                    type="button"
                    :aria-pressed="design.moduleStyle === 'square'"
                    @click="design.moduleStyle = 'square'"
                  >
                    <span class="shape-icon is-square" aria-hidden="true">
                      <i v-for="index in 4" :key="index"></i>
                    </span>
                    Crisp
                  </button>
                </div>
              </div>

              <div class="option-block">
                <label class="field-label" for="error-level">Error correction</label>
                <div class="field-control select-control compact-control">
                  <select id="error-level" v-model="design.ecc">
                    <option value="L">L · 7%</option>
                    <option value="M">M · 15%</option>
                    <option value="Q">Q · 25%</option>
                    <option value="H">H · 30%</option>
                  </select>
                  <ChevronDown class="select-chevron" :size="15" aria-hidden="true" />
                </div>
              </div>

              <div class="option-block">
                <label class="field-label" for="png-size">PNG size</label>
                <div class="field-control select-control compact-control">
                  <select id="png-size" v-model.number="design.pngSize">
                    <option :value="512">512 px</option>
                    <option :value="1024">1024 px</option>
                    <option :value="2048">2048 px</option>
                    <option :value="4096">4096 px</option>
                  </select>
                  <ChevronDown class="select-chevron" :size="15" aria-hidden="true" />
                </div>
              </div>
            </div>

            <button
              class="switch-row"
              type="button"
              role="switch"
              :aria-checked="design.transparent"
              @click="design.transparent = !design.transparent"
            >
              <span class="switch-copy">
                <strong>Transparent background</strong>
                <small>Keep the PNG background see-through.</small>
              </span>
              <span class="switch-track" :class="{ on: design.transparent }" aria-hidden="true">
                <span class="switch-thumb"></span>
              </span>
            </button>
          </div>
        </div>

        <aside class="preview-panel" aria-label="Live QR code preview">
          <div class="preview-glow" aria-hidden="true"></div>

          <div class="preview-top">
            <span class="preview-status">
              <span class="live-dot" aria-hidden="true"></span>
              Live preview
            </span>
            <div class="preview-badges">
              <span v-if="qr" class="meta-chip">v{{ qrVersion }}</span>
              <span v-if="qr" class="meta-chip">{{ moduleCount }} × {{ moduleCount }}</span>
              <span class="meta-chip is-accent">ECC {{ design.ecc }}</span>
            </div>
          </div>

          <div class="preview-body">
            <div class="qr-frame">
              <div class="qr-plate" :class="{ 'is-transparent': design.transparent }">
                <img
                  v-if="qrDataUrl"
                  :src="qrDataUrl"
                  :alt="`QR code encoding ${contentSummary}`"
                  width="512"
                  height="512"
                  draggable="false"
                />
                <div v-else class="qr-empty">
                  <ScanLine :size="28" :stroke-width="1.4" aria-hidden="true" />
                  <p>{{ emptyMessage }}</p>
                </div>
              </div>
            </div>

            <p class="scan-hint">
              <ScanLine :size="14" :stroke-width="1.8" aria-hidden="true" />
              Scan with your phone camera to test it.
            </p>

            <div class="content-strip">
              <div class="content-copy">
                <span class="micro-label">{{ typeLabel }} payload</span>
                <p>{{ contentSummary }}</p>
              </div>
              <div class="content-actions">
                <a
                  v-if="activeType === 'link' && payload"
                  class="icon-button"
                  :href="payload"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open link in a new tab"
                  title="Open link"
                >
                  <ArrowUpRight :size="16" aria-hidden="true" />
                </a>
                <button
                  class="icon-button"
                  type="button"
                  :disabled="!payload"
                  aria-label="Copy encoded content"
                  title="Copy encoded content"
                  @click="copyPayload"
                >
                  <Copy :size="16" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div v-if="lowContrast" class="contrast-alert" role="status">
              <AlertTriangle :size="17" aria-hidden="true" />
              <p>
                <strong>Low contrast ({{ contrast.toFixed(1) }}:1).</strong>
                Pick a darker foreground for a more reliable scan.
              </p>
            </div>

            <div v-if="qrError" class="contrast-alert" role="alert">
              <AlertTriangle :size="17" aria-hidden="true" />
              <p>{{ qrError }}</p>
            </div>

            <div class="download-actions">
              <button
                class="button button-primary"
                type="button"
                :disabled="!qr || isExporting"
                @click="downloadPng"
              >
                <Download :size="17" :stroke-width="2.1" aria-hidden="true" />
                {{ isExporting ? 'Preparing…' : 'Download PNG' }}
                <span class="button-detail">{{ design.pngSize }}px</span>
              </button>
              <button
                class="button button-secondary"
                type="button"
                :disabled="!qr"
                @click="downloadSvg"
              >
                <FileCode2 :size="17" :stroke-width="2" aria-hidden="true" />
                SVG
              </button>
            </div>

            <p class="privacy-note">
              <LockKeyhole :size="14" :stroke-width="1.9" aria-hidden="true" />
              Generated locally in your browser. Nothing is uploaded.
            </p>
          </div>
        </aside>
      </section>
    </main>

    <footer class="site-footer">
      <div class="footer-brand">
        <span class="brand-mark is-small" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="brand-name">QR <em>Studio</em></span>
      </div>
      <p class="footer-tagline">Made for the moment between seeing and going.</p>
      <div class="footer-meta">
        <a
          class="footer-link"
          href="https://github.com/MinThantKo365"
          target="_blank"
          rel="noopener noreferrer"
          title="MinThantKo on GitHub"
        >
          Built by MinThantKo
          <ArrowUpRight :size="11" :stroke-width="2" aria-hidden="true" />
        </a>
        <span class="footer-dot" aria-hidden="true"></span>
        <span>© {{ new Date().getFullYear() }}</span>
      </div>
    </footer>

    <Transition name="toast">
      <div v-if="toast" class="toast" role="status" aria-live="polite">
        <ShieldCheck :size="16" aria-hidden="true" />
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>
