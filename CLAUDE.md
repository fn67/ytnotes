# CLAUDE.md — Project Briefing for Claude Code

## What This Is
`ytnotes` is a Node.js terminal CLI tool that generates smart markdown notes 
from YouTube videos using a local LLM via LM Studio.

## Stack
- **Runtime:** Node.js 18+
- **Transcript:** `youtube-transcript` npm package
- **LLM:** LM Studio local server (OpenAI-compatible API at http://127.0.0.1:1234)
- **LLM SDK:** `openai` npm package pointed at LM Studio
- **Terminal output:** `chalk` for colors, `marked` + `marked-terminal` for markdown rendering
- **Flags/args:** `minimist` or `commander`
- **Config:** `~/.ytnotes.config.json` (JSON file, managed by the tool)

## Default Model
`google/gemma-4-e4b` — this is what the user has loaded in LM Studio.
Always use this as the default unless overridden by `-m` flag.

## Timestamp Support
The `youtube-transcript` API returns each entry with an `offset` field (milliseconds).
Before sending to the LLM, convert the transcript to a timestamped format:
```
[0:12] Welcome to this tutorial on neural networks.
[1:05] First, let's talk about the perceptron model.
```
- Format: `[M:SS]` for videos under an hour, `[H:MM:SS]` for longer
- LLM prompts instruct it to reference timestamps **inline and naturally** — only where they help the reader navigate to a key moment, not on every sentence
