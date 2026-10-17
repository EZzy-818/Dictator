import { Component } from 'react'

// Last line of defense: an unexpected render error shows a message instead of a blank page.
class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto max-w-[880px] px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dictator</h1>
        <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Something went wrong on this page. Reload to try again.
        </p>
      </main>
    )
  }
}

export default ErrorBoundary
