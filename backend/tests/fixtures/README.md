# Test recordings

- `chrome.webm`, `chrome.mp4`: about 3 seconds each, recorded by Chromium's `MediaRecorder` from its fake microphone (a test tone). Like real browser recordings, the WebM file has no duration header.
- `silence-130s.webm`: 130 seconds of silence, longer than the 2-minute limit. Made with `ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 130 -c:a libopus -b:a 6k -f webm pipe:1`.
- `tone-1s.ogg`: a 1-second tone in Ogg Opus, made with ffmpeg.
