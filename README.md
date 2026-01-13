# Study Podcast Player (Web TTS)

A simple static web app that plays a long study script like a podcast using the Web Speech API.

## Features
- Play / Pause / Resume / Stop
- Voice selector
- Speed control
- Chunking for long scripts (prevents TTS stalls)
- Works on GitHub Pages

## Quick Start (Local)
Because browsers block `fetch()` for local files, run a tiny server:

### Option A: Python
```bash
python -m http.server 8080
