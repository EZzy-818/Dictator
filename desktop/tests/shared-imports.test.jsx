// The desktop app imports these web app modules directly (see docs/desktop.md). If a frontend
// change moves or renames one of them, this test fails before the desktop build does.
import { render, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as api from '@frontend/services/api.js'
import { MAX_RECORDING_MS, RECORDER_ERRORS, useAudioRecorder } from '@frontend/hooks/useAudioRecorder.js'
import Waveform from '@frontend/components/Waveform.jsx'
import { DEFAULT_REFINEMENT_LEVEL, REFINEMENT_LEVEL_OPTIONS } from '@frontend/refinementLevels.js'

describe('shared web modules', () => {
  it('exposes the API client the main process uses', () => {
    for (const name of ['getHealth', 'processAudio', 'refineText']) expect(typeof api[name]).toBe('function')
    expect(api.MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
    expect(new api.ApiRequestError('x', { code: 'timeout' }).code).toBe('timeout')
  })

  it('runs the recorder hook on the desktop copy of React', () => {
    // A second React copy (from frontend/node_modules) would throw "Invalid hook call" here.
    const { result } = renderHook(() => useAudioRecorder())
    expect(result.current.status).toBe('idle')
    expect(result.current.maxDurationMs).toBe(MAX_RECORDING_MS)
    expect(Object.keys(RECORDER_ERRORS)).toContain('permission-denied')
  })

  it('renders the waveform', () => {
    const { getByTestId } = render(<Waveform stream={null} />)
    expect(getByTestId('waveform').children).toHaveLength(28)
  })

  it('offers the three refinement levels with Light as the default', () => {
    expect(REFINEMENT_LEVEL_OPTIONS.map((option) => option.value)).toEqual(['none', 'light', 'medium'])
    expect(DEFAULT_REFINEMENT_LEVEL).toBe('light')
  })
})
