import { useEffect, useState } from 'react'

// What the shortcut field shows: the saved shortcut, the keys held so far, or the new one.
function fieldText(view) {
  const { capture } = view
  if (capture?.state === 'captured') return capture.label
  if (capture?.state === 'listening') return capture.modifiers ? `${capture.modifiers}…` : 'Press your new shortcut…'
  return view.shortcutLabel
}

function ShortcutRow({ view, bridge }) {
  const { capture } = view
  const listening = capture?.state === 'listening'
  const captured = capture?.state === 'captured'
  // A capture error (an unusable combination) wins over the result of the last change.
  const note = capture?.error
    ? { type: 'error', text: capture.error }
    : capture
      ? { type: 'hint', text: captured ? 'Press Return or click Save to use it. Esc cancels.' : 'Press Esc to cancel. If nothing appears, macOS or another app is using that shortcut.' }
      : view.message
  const isDefault = view.shortcut === view.defaultShortcut && view.shortcutOk

  return (
    <div className="row shortcut">
      <div className="row-main">
        <div className="row-text">
          <label className="row-title" htmlFor="shortcut-field">
            Recording shortcut
          </label>
          <div className="row-subtitle">Starts and stops dictation from any app.</div>
        </div>
        <output
          id="shortcut-field"
          className={`keycap${capture ? ' recording' : ''}${!capture && !view.shortcutOk ? ' unavailable' : ''}`}
          data-shortcut
          aria-live="polite"
        >
          {fieldText(view)}
        </output>
      </div>
      <div className="row-actions">
        {capture ? (
          <>
            <button type="button" data-action="cancel" onClick={() => bridge.cancelCapture()}>
              Cancel
            </button>
            <button type="button" className="primary" data-action="save" disabled={!captured} onClick={() => bridge.saveCapture()}>
              Save Shortcut
            </button>
          </>
        ) : (
          <>
            <button type="button" data-action="reset" disabled={isDefault} onClick={() => bridge.resetShortcut()}>
              Reset to Default ({view.defaultLabel})
            </button>
            <button type="button" data-action="record" onClick={() => bridge.startCapture()}>
              Record Shortcut
            </button>
          </>
        )}
      </div>
      {note && (
        <p className={`note note-${note.type}`} role={note.type === 'error' ? 'alert' : undefined} data-note={note.type}>
          {note.text}
        </p>
      )}
      {!listening && !captured && (
        <p className="note note-hint">Use ⌘, ⌃ or ⌥ with a letter, number or Space, or a function key on its own.</p>
      )}
    </div>
  )
}

function LevelPicker({ view, bridge }) {
  return (
    <fieldset className="levels">
      <legend className="row-title">Refinement</legend>
      {view.levels.map((option) => (
        <label key={option.value} className="row level">
          <input
            type="radio"
            name="level"
            value={option.value}
            checked={option.value === view.level}
            onChange={() => bridge.setLevel(option.value)}
          />
          <span className="row-text">
            <span className="row-title">{option.label}</span>
            <span className="row-subtitle">{option.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/**
 * The Settings window. Everything shown comes from the main process (src/main/preferences.js),
 * which also receives every change, so the menu bar and this window always agree.
 */
export default function Settings({ bridge = window.dictatorSettings }) {
  const [view, setView] = useState(null)

  useEffect(() => {
    let live = true
    bridge.getView().then((initial) => live && setView((current) => current ?? initial))
    const unsubscribe = bridge.onView(setView)
    return () => {
      live = false
      unsubscribe()
    }
  }, [bridge])

  if (!view) return null
  return (
    <main className="settings" data-settings>
      <section aria-labelledby="general-heading">
        <h2 id="general-heading">General</h2>
        <div className="group">
          <ShortcutRow view={view} bridge={bridge} />
        </div>
      </section>
      <section aria-labelledby="transcription-heading">
        <h2 id="transcription-heading">Transcription</h2>
        <div className="group">
          <LevelPicker view={view} bridge={bridge} />
        </div>
        <p className="footnote">Saved automatically. Also in the menu bar under Refinement.</p>
      </section>
    </main>
  )
}
