import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ErrorBoundary from '../src/components/ErrorBoundary.jsx'

function Broken() {
  throw new Error('render failure')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows a message instead of a blank page when rendering fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/Something went wrong/)
  })

  it('renders children normally', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeTruthy()
  })
})
