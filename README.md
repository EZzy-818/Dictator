# Dictator 🎙️

### AI-Powered Multilingual Voice-to-Text

Dictator is an AI-powered voice dictation web app that transforms natural speech into accurate, polished text. It supports multilingual transcription, removes filler words, handles verbal corrections, and improves writing clarity while preserving the speaker's original intent.

**🌐 [Try Dictator Live](https://dictator-lime.vercel.app/)**

No installation or account required.

## Features

- **Multilingual Transcription:** Supports English, Mandarin Chinese, and mixed-language speech.
- **AI Refinement:** Three levels of text processing:
  - **None:** Raw transcription without modifications.
  - **Light:** Removes filler words and corrects grammar.
  - **Medium:** Improves clarity, structure, and conciseness.
- **Editable Output:** Review and edit transcriptions before copying.
- **Responsive Design:** Works on desktop and mobile browsers.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Audio Capture | MediaRecorder API |
| Speech-to-Text | OpenAI GPT-4o Transcribe |
| AI Refinement | OpenAI GPT-4.1 |
| Deployment | Vercel (Frontend), Render (Backend) |

## Architecture

```text
User Microphone
      |
      v
React Frontend (Vercel)
      |
      | Audio Upload (HTTPS)
      v
Express Backend (Render)
      |
      v
OpenAI Speech-to-Text
      |
      v
Raw Transcript
      |
      v
AI Refinement (None / Light / Medium)
      |
      v
Editable Text → Copy
```

Audio is recorded in the browser and sent to the backend for transcription. Depending on the selected refinement level, the backend either returns the raw transcript or processes it through an LLM.

## Desktop App (macOS, in development)

A macOS menu bar client lives in [`desktop/`](desktop/). It uses the same backend and pipeline as the web app, which is unchanged and keeps running on Vercel. See [docs/desktop.md](docs/desktop.md) to run it locally.

## Future Roadmap

### 1. Realtime Transcription
- Stream audio while the user speaks.
- Reduce latency between finishing speech and receiving polished text.
- Target sub-second post-speech processing under favorable conditions.

### 2. Cross-Application Desktop App
- Build a macOS application, followed by Windows support.
- Global hotkey activation for voice dictation.
- Insert transcribed text directly into applications such as Slack, Gmail, Notion, and VS Code.
- Support background operation without switching windows.

### 3. Intelligent Dictation Features
- **Personal Dictionary:** Recognize custom names and technical terminology.
- **Voice Snippets:** Expand spoken shortcuts into reusable text.
- **Context-Aware Refinement:** Adapt writing style to emails, chats, or documents.
- **Voice Commands:** Edit, format, or rewrite text using spoken instructions.
- **Smart Formatting:** Automatically structure lists, paragraphs, and notes.

## Current Limitations

- Transcription starts after recording stops rather than streaming in realtime.
- Text must be manually copied into other applications.
- Requires an internet connection.
- Transcription accuracy depends on audio quality and language complexity.

---

**[Launch Dictator →](https://dictator-lime.vercel.app/)**

*Speak naturally. Write clearly.*
