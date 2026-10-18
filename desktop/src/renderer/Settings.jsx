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
      ? captured && capture.warning
        ? { type: 'warning', text: `${capture.warning} Press Return or click Save to use it anyway. Esc cancels.` }
        : { type: 'hint', text: captured ? 'Press Return or click Save to use it. Esc cancels.' : 'Press Esc to cancel. If nothing appears, macOS or another app is using that shortcut.' }
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
        <p className="note note-hint">Any key works, on its own or with ⌘ ⌃ ⌥ ⇧. A single key stops typing that key while Dictator runs.</p>
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

function OutputPicker({ view, bridge }) {
  const paste = view.outputMode === 'paste'
  return (
    <>
      <fieldset className="levels">
        <legend className="row-title">Output Behavior</legend>
        {view.outputOptions.map((option) => (
          <label key={option.value} className="row level">
            <input
              type="radio"
              name="output"
              value={option.value}
              checked={option.value === view.outputMode}
              onChange={() => bridge.setOutputMode(option.value)}
            />
            <span className="row-text">
              <span className="row-title">{option.label}</span>
              <span className="row-subtitle">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {paste && view.accessibility !== null && (
        <div className="row permission" data-accessibility={view.accessibility ? 'on' : 'off'}>
          <div className="row-main">
            <div className="row-text">
              <span className="row-title">Accessibility access: {view.accessibility ? 'On' : 'Off'}</span>
              <span className="row-subtitle">
                {view.accessibility
                  ? 'Dictator may send ⌘V to the app you are dictating into.'
                  : 'Needed to paste. Until it is on, Dictator only copies. Turn on Dictator in System Settings › Privacy & Security › Accessibility, then come back here.'}
              </span>
            </div>
            {!view.accessibility && (
              <button type="button" data-action="open-accessibility" onClick={() => bridge.openAccessibilitySettings()}>
                Open Accessibility Settings…
              </button>
            )}
          </div>
        </div>
      )}
      {paste && view.accessibility === null && (
        <div className="row">
          <span className="row-subtitle">Auto-Paste is not available on this computer, so Dictator only copies.</span>
        </div>
      )}
    </>
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
      <section aria-labelledby="output-heading">
        <h2 id="output-heading">Output</h2>
        <div className="group">
          <OutputPicker view={view} bridge={bridge} />
        </div>
        <p className="footnote" data-limits>
          Experimental. It pastes only if the app you started recording in is still in front with a text field focused. It
          cannot tell whether that is the same field, so check where the cursor is before you stop. It never pastes into
          password fields or switches apps, and only copies when unsure. The text always stays on the clipboard. Also in
          the menu bar under Output.
        </p>
      </section>
    </main>
  )
}
