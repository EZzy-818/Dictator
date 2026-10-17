# Privacy and audio processing

This is the full version of the notice shown at the bottom of the app under "How your audio is handled". Keep the two in sync.

## What happens to a recording

1. **Recording.** The browser records only between Start Recording and Stop Recording, for at most 2 minutes. The microphone is released as soon as recording stops. Nothing is recorded in the background.
2. **Upload.** The recording is uploaded to the Dictator backend over https, together with the language option you chose.
3. **Processing on the Dictator server.** The audio is held in memory only for the duration of the request (`multer` memory storage) and is never written to disk. When the request ends it is discarded.
4. **Transcription by OpenAI.** The backend sends the audio to OpenAI's speech-to-text API (`gpt-4o-transcribe`).
5. **Refinement by OpenAI.** The backend sends the transcript text to OpenAI's Responses API (`gpt-4.1`) with `store: false`. Retry Refinement sends the same transcript again.
6. **Results.** The raw transcript and refined text are returned to your browser and shown on the page only. Dictator keeps no copy, no history and no accounts. Closing or reloading the page discards them.

## What Dictator logs

The backend logs start-up messages and, when something fails, the error type and status code (for example a failed or refused OpenAI request), without the content. For abuse monitoring it also logs one line per request: the time, the endpoint, the result, how long it took, the upload size, the language option, and a hashed visitor tag that cannot be turned back into an IP address and changes when the server restarts. It never logs audio, transcripts, refined text or IP addresses.

To enforce usage limits, the backend counts requests per IP address. The counters hold only the address, a count and an expiry time, and expire within 24 hours. They are kept in the server's memory or, when configured, in a Redis store. The hosting providers (for example Render and Vercel) keep their own request logs, such as IP addresses, URLs and times, under their own policies.

## What OpenAI keeps

According to OpenAI's published [data controls for the API](https://developers.openai.com/api/docs/guides/your-data), checked on 2026-10-17:

- Data sent to the OpenAI API is not used to train OpenAI's models unless the account owner opts in.
- The audio transcription endpoint (`/v1/audio/transcriptions`) has no abuse-monitoring retention and no stored application state.
- For the Responses API, abuse-monitoring logs are kept for up to 30 days unless longer retention is required by law. Dictator sends refinement requests with `store: false`, so OpenAI does not store them as retrievable responses.

These are OpenAI's terms and can change; check the link for the current version.

## For users

Dictator is a dictation tool, not a secure storage service. Avoid dictating passwords, payment details or other information you would not want to send to these services.
