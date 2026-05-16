# PRD — ytnotes Product Requirements Document

## Overview
`ytnotes` is a developer-friendly terminal CLI tool that takes a YouTube URL, 
fetches the video transcript, sends it to a local LLM (via LM Studio), and 
generates structured smart notes in Markdown format.

## Goals
- Zero friction — one command, one URL, get notes
- Works fully offline (except fetching transcript)
- Clean, readable terminal output
- Simple config, no bloat

## Target User
Developers and learners who watch YouTube videos and want structured notes 
without leaving the terminal.

---

## Installation
```bash
npm install -g .
```
After install, `ytnotes` is available globally in terminal.

---

## Usage

```bash
ytnotes [flags] "<youtube-url>"
```

### Flags

| Flag | Description |
|------|-------------|
| (none) | View notes in terminal — default behaviour |
| `-v` | Explicitly view notes in terminal |
| `-w` | Save notes to file only (no terminal preview) |
| `-vw` | View in terminal AND save to file |
| `-p <path>` | Override output directory for this run |
| `-m <model>` | Override LLM model for this run |
| `--config set-path <path>` | Set default save directory |
| `--config set-model <model>` | Set default LLM model |
| `--config show` | Display current config |

### Examples
```bash
# View notes in terminal (default)
ytnotes "https://www.youtube.com/watch?v=xxx"

# Save only
ytnotes -w "https://www.youtube.com/watch?v=xxx"

# View and save
ytnotes -vw "https://www.youtube.com/watch?v=xxx"

# Save to custom path
ytnotes -vw -p ~/Documents/notes "https://www.youtube.com/watch?v=xxx"

# Use a different model
ytnotes -m mistral "https://www.youtube.com/watch?v=xxx"

# Set default save path
ytnotes --config set-path ~/Documents/notes

# Show config
ytnotes --config show
```

---

## Config System

Config is stored at `~/.ytnotes.config.json`:

```json
{
  "defaultPath": "~/notes",
  "defaultModel": "google/gemma-4-e4b"
}
```

- Created automatically on first run if it doesn't exist
- `--config set-path` updates `defaultPath`
- `--config set-model` updates `defaultModel`
- `-p` and `-m` flags override config values for that run only

---

## Notes Format

Generated notes must follow this structure:

```markdown
# Video Title

## Summary
3-5 sentence overview of the video.

## Key Points
- Point one
- Point two
- ...

## Detailed Notes
Organised sections covering main topics discussed.

## Key Terms & Concepts
- **Term:** Definition

## Takeaways
- What to remember or act on
```

---

## Terminal Rendering (View Mode)

- Notes are rendered using `marked` + `marked-terminal`
- No raw markdown symbols (`#`, `**`, `-`) visible
- Headings appear as bold coloured text
- Bullets render as clean bullet points
- A separator line shown between sections

---

## Error Handling

| Scenario | Message |
|----------|---------|
| LM Studio not running | "LM Studio server not found at http://127.0.0.1:1234. Please start the server and try again." |
| No transcript available | "No transcript found for this video. It may be disabled or unavailable." |
| Invalid YouTube URL | "Invalid YouTube URL. Please provide a valid URL." |
| Transcript too long | Automatically chunked — no error shown to user |

---

## File Naming
- Derived from video title
- Slugified (lowercase, spaces → hyphens, special chars removed)
- Example: `how-transformers-work.md`
- If file already exists, append timestamp to avoid overwrite

---

## Out of Scope (for now)
- Audio transcription (Whisper) for videos without captions
- GUI or web interface
- Cloud LLM support (OpenAI, Anthropic)
- Multiple output formats (PDF, HTML)