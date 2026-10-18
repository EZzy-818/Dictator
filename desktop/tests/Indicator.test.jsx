import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Indicator from '../src/renderer/Indicator.jsx'

const pill = (view) => render(<Indicator view={view} />).container.querySelector('[data-indicator]')

describe('Indicator', () => {
  it('shows recording with a timer and the waveform', () => {
    const { container, getByTestId } = render(<Indicator view={{ phase: 'recording', startedAt: Date.now() }} />)
    expect(container.textContent).toMatch(/Recording 0:0\d/)
    expect(getByTestId('waveform')).toBeTruthy()
  })

  it('shows the three outcomes in different tones', () => {
    expect(pill({ phase: 'done', outcome: 'refined', message: 'Copied to clipboard' }).className).toContain('tone-success')
    expect(pill({ phase: 'done', outcome: 'raw', message: 'Copied raw transcript' }).className).toContain('tone-warning')
    expect(pill({ phase: 'done', outcome: 'failed', message: 'Could not reach the server.' }).className).toContain('tone-error')
    expect(pill({ phase: 'done', outcome: 'copy_failed', message: 'x' }).className).toContain('tone-error')
  })

  it('prefers a notice over the current message', () => {
    expect(pill({ phase: 'processing', message: 'Transcribing…', notice: 'Still transcribing. Please wait.' }).textContent).toBe(
      'Still transcribing. Please wait.',
    )
  })
})
