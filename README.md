# ytnotes

Generate structured markdown notes from any YouTube video using a local LLM. One command, one URL, no cloud.

```
ytnotes "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

---

## How it works

1. Fetches the video transcript via the YouTube captions API
2. Sends the transcript to a local LLM running in [LM Studio](https://lmstudio.ai)
3. Renders the notes in your terminal and/or saves them as a markdown file

Long transcripts are automatically split into chunks, summarized in parts, then synthesized into a single coherent document.

---

## Requirements

- **Node.js** 18+
- **[LM Studio](https://lmstudio.ai)** with the local server enabled (default: `http://127.0.0.1:1234`)
- A loaded model — default is `google/gemma-4-e4b`

---

## Installation

```bash
git clone https://github.com/fn67/ytnotes.git
cd ytnotes
npm install
npm install -g .
```

After the global install, `ytnotes` is available anywhere in your terminal.

---

## Usage

```bash
ytnotes [flags] "<youtube-url>"
```

### Flags

| Flag | Description |
|------|-------------|
| *(none)* | View notes in terminal — default behaviour |
| `-v` | Explicitly view notes in terminal |
| `-w` | Save notes to file only (no terminal output) |
| `-vw` | View in terminal **and** save to file |
| `-p <path>` | Override the output directory for this run |
| `-m <model>` | Override the LLM model for this run |
| `--config set-path <path>` | Set the default save directory |
| `--config set-model <model>` | Set the default LLM model |
| `--config show` | Print the current config |

### Examples

```bash
# View notes in terminal (default)
ytnotes "https://www.youtube.com/watch?v=xxx"

# Save to file only
ytnotes -w "https://www.youtube.com/watch?v=xxx"

# View and save
ytnotes -vw "https://www.youtube.com/watch?v=xxx"

# Save to a custom directory
ytnotes -vw -p ~/Documents/notes "https://www.youtube.com/watch?v=xxx"

# Use a different model
ytnotes -m mistral "https://www.youtube.com/watch?v=xxx"

# Short URL format works too
ytnotes "https://youtu.be/xxx"
```

---

## Config

Config is stored at `~/.ytnotes.config.json` and created automatically on first run.

```json
{
  "defaultPath": "~/notes",
  "defaultModel": "google/gemma-4-e4b"
}
```

```bash
# Change the default save directory
ytnotes --config set-path ~/Documents/notes

# Change the default model
ytnotes --config set-model mistral

# View current config
ytnotes --config show
```

The `-p` and `-m` flags override config values for that run only and do not modify the config file.

---

## Notes format

Every generated note follows this structure:

```markdown
# Video Title

## Summary
3-5 sentence overview of the video.

## Key Points
- Point one
- Point two

## Detailed Notes
Organised sections covering the main topics discussed.

## Key Terms & Concepts
- **Term:** Definition

## Takeaways
- What to remember or act on
```

When saved to a file, notes include a YAML frontmatter block with metadata:

```yaml
---
source: "https://www.youtube.com/watch?v=xxx"
video_id: "xxx"
model: "google/gemma-4-e4b"
generated: "2026-05-16T12:00:00.000Z"
words_in_transcript: 4821
---
```

### File naming

Filenames are slugified from the video title — `how-transformers-work.md`. If a file with that name already exists, a timestamp is appended to avoid overwrites.

---

## Error handling

| Situation | Message |
|-----------|---------|
| LM Studio not running | `LM Studio server not found at http://127.0.0.1:1234. Please start the server and try again.` |
| No transcript available | `No transcript found for this video. It may be disabled or unavailable.` |
| Invalid YouTube URL | `Invalid YouTube URL. Please provide a valid URL.` |
| Transcript too long | Automatically chunked and synthesized — no error shown |

---

## Stack

| Purpose | Package |
|---------|---------|
| Transcript fetching | `youtube-transcript` |
| LLM calls | `openai` (pointed at LM Studio) |
| Terminal rendering | `marked` + `marked-terminal` |
| Arg parsing | `minimist` |
| Terminal colours | `chalk` |
