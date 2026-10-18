# Desktop app (macOS)

The desktop app is a macOS menu bar client for the same Express backend the web app uses. It lives in `desktop/` as its own npm package. The web frontend (`frontend/`, deployed on Vercel) and the backend (`backend/`, deployed on Render) are not changed by it, and neither deployment builds anything from `desktop/`.

Status: **D0, scaffold only.** The app starts as a menu bar icon, loads a hidden status window and checks the backend. Recording, the global hotkey and the clipboard arrive in later milestones.

## How it fits together

- **Main process** (`src/main/`): menu bar icon, windows, permissions, and every request to the backend. It uses the web app's API client, `frontend/src/services/api.js`, unchanged.
- **Indicator window** (`src/renderer/`): a small floating window that will also host the recorder. It is sandboxed, has no Node.js access and no network access (its Content Security Policy sets `connect-src 'none'`).
- **Preload** (`src/preload/`): the only bridge between the two, exposed as `window.dictator`.

The API key stays on the backend. Requests from the main process carry no `Origin` header, so the backend's `CORS_ORIGINS` setting needs no entry for the desktop app.

### Code shared with the web app

The desktop build imports these files from `frontend/src` through the `@frontend` alias instead of copying them:

| File | Used for |
| --- | --- |
| `services/api.js` | All backend requests, same timeouts and error messages |
| `hooks/useAudioRecorder.js` | Recording (from D1) |
| `components/Waveform.jsx` | Microphone level in the indicator |
| `refinementLevels.js` | None / Light / Medium |

`desktop/tests/shared-imports.test.jsx` fails if one of them moves or changes shape. The build dedupes React so these files use the desktop copy rather than one from `frontend/node_modules`.

## Backend address

The address is fixed at build time from `DICTATOR_API_BASE_URL` (environment or `desktop/.env`, see `desktop/.env.example`):

- `npm run dev` without it uses the local backend, `http://localhost:3001`, so development never reaches production by accident.
- `npm run build`, `pack` and `dist:mac` refuse to build without it, and require https except for localhost.

## Running it

Needs Node.js 20.19 or later. From the repository root:

```sh
npm install --prefix desktop
npm run dev --prefix backend      # in one terminal, with backend/.env set up as for the web app
npm run dev:desktop               # in another
```

A microphone icon appears in the menu bar, with no Dock icon. Its menu shows whether the backend answered. Quit from that menu.

## Tests

```sh
npm test --prefix desktop                    # unit tests (config, security rules, shared imports, indicator)
npm run test:integration --prefix desktop    # builds and launches the app (see below)
npm run test:desktop                         # both, from the repository root
```

The integration tests build the app in development and production modes, launch it with `--self-check` against a local stub backend, and check that the shared API client reached the address injected at build time with no `Origin` header. The last test packages the app with electron-builder and runs the same check on the packaged binary; set `DICTATOR_SKIP_PACKAGED=1` to skip it. On Linux they need `xvfb-run`.

## Packaging

```sh
DICTATOR_API_BASE_URL=https://dictator-api.onrender.com npm run dist:mac --prefix desktop
```

This writes a dmg and zip for Apple Silicon and Intel to `desktop/release/`. Builds are not signed with a Developer ID yet, so the first launch needs right-click › Open, and macOS may ask for microphone access again after each new build. Nothing is published or uploaded.

## Security settings

- Every window: context isolation, sandbox, no Node integration, no web views; new windows and navigation away from the app page are blocked.
- Only microphone audio may be requested, and only by the app's own page.
- Electron fuses: `RunAsNode`, `NODE_OPTIONS` and `--inspect` are disabled; the app only loads from its asar archive, with integrity checks.
- `GrantFileProtocolExtraPrivileges` is still on because the app page is loaded from a file; moving to a custom protocol so it can be turned off is planned for D4.
