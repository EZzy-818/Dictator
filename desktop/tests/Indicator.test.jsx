import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Indicator from '../src/renderer/Indicator.jsx'

describe('Indicator', () => {
  it('renders the idle pill with a waveform', () => {
    const { container, getByText, getByTestId } = render(<Indicator />)
    expect(container.querySelector('[data-indicator]')).not.toBeNull()
    expect(getByText('Dictator')).toBeTruthy()
    expect(getByTestId('waveform')).toBeTruthy()
  })
})
