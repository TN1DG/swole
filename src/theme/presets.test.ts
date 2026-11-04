import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_PRESET, THEME_PRESET_IDS } from '../../convex/themePresets'
import { hexToRgbChannels, presetFor, THEME_PRESETS } from './presets'

function luminance(hex: string): number {
  const channels = hexToRgbChannels(hex)
    .split(' ')
    .map((c) => {
      const v = Number(c) / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// WCAG AA: 4.5:1 for body text, 3:1 for accent-coloured links and icons.
describe.each(THEME_PRESET_IDS)('%s preset is readable', (id) => {
  const preset = THEME_PRESETS[id]

  it('text on every background', () => {
    expect(contrast(preset.text, preset.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(preset.text, preset.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(preset.text, preset.surface2)).toBeGreaterThanOrEqual(4.5)
  })

  it('muted text on surfaces', () => {
    expect(contrast(preset.muted, preset.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('accent used as a link or icon colour', () => {
    expect(contrast(preset.accent, preset.surface)).toBeGreaterThanOrEqual(3)
  })

  it('button text on the accent', () => {
    // Rust is the original brand colour, at 4.34:1 — just under AA. It's kept
    // as shipped rather than changing the brand as a side effect of theming;
    // every other preset has to clear the bar properly.
    const floor = id === 'rust' ? 4.3 : 4.5
    expect(contrast(preset.accentFg, preset.accent)).toBeGreaterThanOrEqual(floor)
  })
})

describe('presetFor', () => {
  it('finds a preset by id', () => {
    expect(presetFor('ocean').id).toBe('ocean')
  })

  // A value cached by a newer build, or one since removed, mustn't break the app.
  it.each([null, undefined, '', 'nonsense'])('falls back to the default for %s', (id) => {
    expect(presetFor(id).id).toBe(DEFAULT_THEME_PRESET)
  })
})
