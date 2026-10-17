import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/App.jsx'
import { installMediaMocks, removeMediaMocks } from './mediaMocks.js'

describe('App recording flow', () => {
  let media

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 'ok' }) })))
    media = installMediaMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    removeMediaMocks()
  })

  it('defaults to Auto-detect', () => {
    render(<App />)
    expect(screen.getByLabelText('Auto-detect').checked).toBe(true)
  })

  it('changing the language does not interfere with recording', async () => {
    render(<App />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start Recording' })))
    expect(screen.getByText('Recording')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('中文'))
    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByText('Recording')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' }))

    expect(screen.getByTestId('recording-summary').textContent).toContain('0:02')
    expect(screen.getByLabelText('中文').checked).toBe(true)
    expect(media.tracks[0].stop).toHaveBeenCalled()
  })
})
