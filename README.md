# ytnotes

Generate structured markdown notes from any YouTube video using a local LLM. One command, one URL, no cloud.

```
ytnotes "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

---

## How it works

1. Fetches the video transcript (with timestamps) via the YouTube captions API
2. Sends the timestamped transcript to a local LLM running in [LM Studio](https://lmstudio.ai)
3. Renders the notes in your terminal and enters an interactive Q&A session
4. At the end of the session, choose to save notes, save notes + Q&A, or exit

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
| *(none)*, `-i` | Interactive mode — render notes, Q&A session, then save prompt **[default]** |
| `-w` | Save notes to file directly — no terminal display or interaction |
| `-p <path>` | Override the output directory for this run |
| `-m <model>` | Override the LLM model for this run |
| `--help`, `-h` | Show the help page |
| `--config set-path <path>` | Set the default save directory |
| `--config set-model <model>` | Set the default LLM model |
| `--config show` | Print the current config |

### Examples

```bash
# Interactive mode (default) — view notes, ask questions, then save or exit
ytnotes "https://www.youtube.com/watch?v=xxx"

# Same, explicit flag
ytnotes -i "https://www.youtube.com/watch?v=xxx"

# Save to file directly — no interaction
ytnotes -w "https://www.youtube.com/watch?v=xxx"

# Save to a custom directory
ytnotes -w -p ~/Documents/notes "https://www.youtube.com/watch?v=xxx"

# Use a different model
ytnotes -m mistral "https://www.youtube.com/watch?v=xxx"

# Short URL format works too
ytnotes "https://youtu.be/xxx"

# Show all flags and commands
ytnotes --help
```

---

## Interactive mode

After notes are generated and rendered, ytnotes enters an interactive Q&A session. You can ask any question about the video and the LLM answers using the full transcript as context.

```
  /1 save notes only · /2 save notes + Q&A · /3 exit without saving
  > What framework does the speaker recommend for production use?
```

When you're done, use a slash command to finish:

| Command | Action |
|---------|--------|
| `/1` | Save notes to file and exit |
| `/2` | Save notes + full Q&A transcript to file and exit |
| `/3` | Exit without saving |

Press `Ctrl+C` at any time to exit without saving.

### Saved Q&A format

When saving with `/2`, the Q&A session is appended to the notes file under a `## Q&A` section:

```markdown
## Q&A

**Q:** What framework does the speaker recommend?

**A:** The speaker recommends PyTorch for research and TensorFlow for production...

---

**Q:** When does the live demo start?

**A:** The live coding demo begins at [12:30]...
```

---

## Timestamps in notes

The transcript is sent to the LLM with timestamps attached to each line. The LLM is instructed to reference them naturally inline — only at key moments worth navigating to:

> The speaker introduces the attention mechanism **[8:45]** using a library analogy, then walks through the full implementation **[14:20]**.

Timestamps are never forced into every sentence — only where they genuinely help you jump to the right moment.

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
Organised sections covering the main topics, with inline timestamps [M:SS]
where they help you navigate to key moments.

## Key Terms & Concepts
- **Term:** Definition

## Takeaways
- What to remember or act on
```

When saved to a file, notes include a YAML frontmatter block:

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
| LLM error during Q&A | Error shown inline, session continues — use `/1` `/2` `/3` to exit |

---

## Stack

| Purpose | Package |
|---------|---------|
| Transcript fetching | `youtube-transcript` |
| LLM calls | `openai` (pointed at LM Studio) |
| Terminal rendering | `marked` + `marked-terminal` |
| Interactive Q&A input | `readline` (Node.js built-in) |
| Arg parsing | `minimist` |
| Terminal colours | `chalk` |
