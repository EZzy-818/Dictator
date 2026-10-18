# Desktop app (macOS)

Dictator Desktop is a macOS menu bar app for the same Express backend the web app uses. Press a hotkey, speak, press it again, and the transcript is on your clipboard, ready to paste wherever you were typing. It never pastes or types into other apps.

It lives in `desktop/` as its own npm package. The web frontend (`frontend/`, on Vercel) and the backend (`backend/`, on Render) are not changed by it, and neither deployment builds anything from `desktop/`.

## Using it

- **⌃⌥Space** (Control+Option+Space) starts recording; press it again to stop. Up to 2 minutes, like the web app.
- A small pill at the top of the screen shows what is happening: recording (with a timer and level meter), transcribing, then the result. It never takes focus or catches clicks.
- When it says **Copied to clipboard** (green), paste with ⌘V.
- **Copied raw transcript (refinement failed)** (amber) means transcription worked but the cleanup step did not; the unrefined transcript is on the clipboard.
- A red message means nothing was copied and your clipboard is unchanged: the microphone, the network or the server failed, or no speech was heard.
- Pressing the hotkey while it is transcribing does nothing (it says so). Pressing it again right after starting, before the microphone is on, cancels.
- The menu bar icon (a microphone) has: Start/Stop Recording, Copy Last Transcript, Refinement (None / Light / Medium, remembered; Light by default), Hotkey (⌃⌥Space, ⌃⌥D, ⌃⇧Space, ⌥⇧D), the server status and Quit. A dot next to the icon means recording, an ellipsis means busy.
- If the Mac sleeps or locks while recording, what was said so far is transcribed and copied.
- English, Mandarin, Hindi and mixed speech work as on the web: the backend detects the language.

### Menu bar icon not showing

macOS 26 can keep a new app's icon out of the menu bar, and on MacBooks with a notch a full menu bar hides icons behind it. Turn on Dictator (or "Electron" when running `npm run dev:desktop`) in System Settings › Menu Bar › Allow in the Menu Bar, or quit a few other menu bar apps. The hotkey works either way.

### Microphone permission

The first recording asks for microphone access. If it was denied, the pill says so and the menu offers **Open Microphone Settings…** (System Settings › Privacy & Security › Microphone). Turn on Dictator there and try again.

### Limits

The desktop app and the website share the backend's usage limits, counted per network address: 5 recordings a minute, 30 a day, and 100 a day for everyone together.

## Installing the packaged app

```sh
npm ci --prefix desktop
DICTATOR_API_BASE_URL=https://dictator-api.onrender.com npm run dist:mac --prefix desktop
```

This writes `desktop/release/Dictator-<version>-arm64.dmg` (and an Intel build, plus zips). Open the dmg and drag Dictator to Applications. The build is signed ad hoc, not with an Apple Developer ID, so the first time:

1. In Finder, open Applications, Control-click Dictator and choose **Open**, then **Open** again. (Or, if macOS says the app is damaged or can't be checked: `xattr -dr com.apple.quarantine /Applications/Dictator.app`.)
2. Click the menu bar microphone, or press ⌃⌥Space, and allow microphone access.

Because the signature changes with every build, macOS may ask for microphone access again after you install a new build.

## How it fits together

- **Main process** (`src/main/`): menu bar, hotkey, windows, permissions, the clipboard and every request to the backend. `controller.js` is the dictation state machine (idle → starting → recording → processing → done). Requests use the web app's API client, `frontend/src/services/api.js`, unchanged.
- **Indicator window** (`src/renderer/`): the floating pill. It also runs the recorder, the web app's `useAudioRecorder`, while hidden. It is sandboxed, has no Node.js and no network access (CSP `connect-src 'none'`), and is served from `app://dictator`.
- **Preload** (`src/preload/`): the only bridge between the two, `window.dictator`, a few named functions. The main process checks the sender and every payload (`src/main/ipc.js`).

The OpenAI key stays on the backend. Requests from the main process carry no `Origin` header, so the backend's `CORS_ORIGINS` needs no entry for the desktop app.

### Code shared with the web app

Imported from `frontend/src` through the `@frontend` alias instead of copied:

| File | Used for |
| --- | --- |
| `services/api.js` | All backend requests, with the same timeouts and error messages |
| `hooks/useAudioRecorder.js` | Recording, format choice, 2-minute limit, recorder error codes |
| `components/Waveform.jsx` | Microphone level in the pill |
| `refinementLevels.js` | None / Light / Medium |

`desktop/tests/shared-imports.test.jsx` fails if one of them moves or changes shape, or if a recorder error code has no desktop wording. The build dedupes React so these files use the desktop copy.

## Backend address

Fixed at build time from `DICTATOR_API_BASE_URL` (environment or `desktop/.env`, see `desktop/.env.example`):

- Development builds (`npm run dev`, `--mode development`) use `http://localhost:3001` when it is unset, so development never reaches production by accident.
- Production builds (`npm run build`, `pack`, `dist:mac`) refuse to build without it, and require https except for localhost.

## Development

Needs Node.js 20.19 or later.

```sh
npm ci --prefix desktop
npm run dev --prefix backend     # terminal 1, with backend/.env set up as for the web app
npm run dev:desktop              # terminal 2
```

In development macOS asks for microphone access for "Electron", the development binary.

## Tests

```sh
npm test --prefix desktop                    # unit tests
npm run test:integration --prefix desktop    # builds and launches the real app
npm run test:desktop                         # both, from the repository root
```

- **Unit:** the state machine (every outcome, repeated presses, cancel, interruptions, crashes), IPC validation, settings, clipboard, menu, hotkey, the build-time address rules, security rules, the recorder hook (with the web app's media mocks), the pill, and the shared imports.
- **Integration:** builds in development and production modes and checks the injected address; launches the development build, the production build and the packaged app with `--self-check` against a stub backend; records in the hidden window with Chromium's fake microphone (`--record-test`); sends a real recording through the real backend app with a fake OpenAI client (`--transcribe-test`), covering refined, raw-fallback, failed and offline results and None/Light/Medium; and runs whole dictations end to end through a test-only stdin hook (`DICTATOR_E2E=1`, ignored by the packaged app), including a recorder crash. Backend dependencies must be installed for the last two. On Linux these need `xvfb-run`; set `DICTATOR_SKIP_PACKAGED=1` to skip packaging.
- **Acceptance on a Mac:** `desktop/scripts/acceptance-mac.mjs` uses the real microphone and macOS text-to-speech to dictate English, Mandarin, Hindi and mixed sentences at each level against a running backend.

## Security settings

- Every window: context isolation, sandbox, no Node integration, no web views. New windows and navigation away from the app page are blocked.
- Only microphone audio may be requested, and only by the app's own page.
- Electron fuses: `RunAsNode`, `NODE_OPTIONS` and `--inspect` are off; the app loads only from its asar archive, with integrity checks; `file://` gets no extra privileges.
- The hotkey uses the system hotkey API: no Accessibility or Input Monitoring permission, and no keystrokes are ever sent.
