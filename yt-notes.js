#!/usr/bin/env node
import { createRequire } from 'module';
import { homedir } from 'os';
import { YoutubeTranscript } from 'youtube-transcript';
import OpenAI from 'openai';
import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

const require = createRequire(import.meta.url);
const minimist = require('minimist');

marked.use(markedTerminal());

const DEFAULT_MODEL = 'google/gemma-4-e4b';
const API_BASE = 'http://127.0.0.1:1234/v1';
const CHUNK_WORD_LIMIT = 6000;
const CONFIG_PATH = join(homedir(), '.ytnotes.config.json');
const DEFAULT_CONFIG = { defaultPath: '~/notes', defaultModel: DEFAULT_MODEL };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function resolvePath(p) {
  if (p.startsWith('~/') || p === '~') return join(homedir(), p.slice(1));
  return p;
}

function handleConfigCommand(argv, config) {
  const sub = argv.config;
  const value = argv._[0];

  if (sub === 'show') {
    console.log(chalk.bold('Current config:'));
    console.log(chalk.dim(`  defaultPath:  ${config.defaultPath}`));
    console.log(chalk.dim(`  defaultModel: ${config.defaultModel}`));
    process.exit(0);
  }
  if (sub === 'set-path') {
    if (!value) {
      console.error(chalk.red('Error: No path provided. Usage: ytnotes --config set-path <path>'));
      process.exit(1);
    }
    config.defaultPath = value;
    saveConfig(config);
    console.log(chalk.green(`Default path set to: ${value}`));
    process.exit(0);
  }
  if (sub === 'set-model') {
    if (!value) {
      console.error(chalk.red('Error: No model provided. Usage: ytnotes --config set-model <model>'));
      process.exit(1);
    }
    config.defaultModel = value;
    saveConfig(config);
    console.log(chalk.green(`Default model set to: ${value}`));
    process.exit(0);
  }
  console.error(chalk.red(`Unknown config subcommand: "${sub}"`));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(config) {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['v', 'w'],
    string: ['config', 'm', 'p'],
    alias: { model: 'm', path: 'p' },
  });

  const saveMode = argv.w === true;
  const viewMode = !saveMode || argv.v === true;

  return {
    argv,
    url: argv._[0] ?? null,
    model: argv.m || config.defaultModel,
    outputPath: argv.p ? resolvePath(argv.p) : resolvePath(config.defaultPath),
    viewMode,
    saveMode,
  };
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id || null;
    }
    if (parsed.hostname === 'youtube.com' || parsed.hostname === 'www.youtube.com') {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v');
      const short = parsed.pathname.match(/^\/(shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (short) return short[2];
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transcript helpers
// ---------------------------------------------------------------------------

function transcriptToText(entries) {
  return entries.map(e => e.text.trim()).join(' ');
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function chunkByWords(text, limit) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += limit) {
    chunks.push(words.slice(i, i + limit).join(' '));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// LLM calls
// ---------------------------------------------------------------------------

async function callLLM(client, model, systemPrompt, userContent) {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
  });
  return response.choices[0].message.content.trim();
}

const SINGLE_SYSTEM = `You are an expert note-taker. Given a YouTube video transcript, produce well-structured markdown notes using EXACTLY this structure and these section headings:

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

Rules:
- Replace "Video Title" with the actual title inferred from the transcript.
- Use proper markdown. Do not wrap output in a code block.
- Do not add any sections beyond those listed above.`;

const CHUNK_SYSTEM = (n, total) =>
  `You are summarizing section ${n} of ${total} of a YouTube transcript. Extract the key ideas, facts, and arguments from this section into concise markdown notes. Be thorough — these partial notes will be combined later.`;

const SYNTHESIS_SYSTEM = `You are combining partial notes from different sections of a single YouTube video into one cohesive markdown document. Merge overlapping ideas, remove redundancy, and produce the final notes using EXACTLY this structure:

# Video Title

## Summary
3-5 sentence overview.

## Key Points
- Point one

## Detailed Notes
Organised sections covering the main topics discussed.

## Key Terms & Concepts
- **Term:** Definition

## Takeaways
- What to remember or act on

Rules:
- Replace "Video Title" with the actual title inferred from the content.
- Use proper markdown. Do not wrap in a code block.
- Do not add any sections beyond those listed above.`;

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function isConnectionError(err) {
  return (
    err.code === 'ECONNREFUSED' ||
    err.cause?.code === 'ECONNREFUSED' ||
    err.message?.toLowerCase().includes('fetch failed') ||
    err.message?.toLowerCase().includes('econnrefused')
  );
}

function handleLLMError(err, model) {
  if (isConnectionError(err)) {
    console.error(chalk.red(`LM Studio server not found at ${API_BASE.replace('/v1', '')}. Please start the server and try again.`));
  } else if (err.status === 404 || err.message?.includes('model')) {
    console.error(chalk.red(`Error: Model "${model}" was not found.`));
    console.error(chalk.dim('Verify the model is loaded in LM Studio, or pass a different name with -m.'));
  } else {
    console.error(chalk.red(`LM Studio error: ${err.message}`));
  }
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function extractTitleSlug(notes) {
  const match = notes.match(/^#\s+(.+)/m);
  if (!match) return null;
  return match[1].toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getOutputFilePath(notes, outputDir) {
  const slug = extractTitleSlug(notes) || `notes-${Date.now()}`;
  const base = join(outputDir, `${slug}.md`);
  if (existsSync(base)) return join(outputDir, `${slug}-${Date.now()}.md`);
  return base;
}

function renderToTerminal(notes) {
  const body = notes.replace(/^---[\s\S]*?---\n+/, '');
  process.stdout.write(marked.parse(body));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const { argv, url, model, outputPath, viewMode, saveMode } = parseArgs(config);

  if (argv.config) {
    handleConfigCommand(argv, config);
  }

  if (!url) {
    console.error(chalk.red('Error: No YouTube URL provided.'));
    console.error(chalk.dim('Usage: ytnotes [flags] "<youtube-url>"'));
    console.error(chalk.dim('Flags: -v (view) -w (save) -vw (both) -p <path> -m <model>'));
    process.exit(1);
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    console.error(chalk.red('Invalid YouTube URL. Please provide a valid URL.'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n  ytnotes'));
  console.log(chalk.dim(`  URL:   ${url}`));
  console.log(chalk.dim(`  Model: ${model}\n`));

  // Fetch transcript
  process.stdout.write(chalk.yellow('→ Fetching transcript... '));
  let entries;
  try {
    entries = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (err) {
    process.stdout.write('\n');
    console.error(chalk.red('No transcript found for this video. It may be disabled or unavailable.'));
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    process.stdout.write('\n');
    console.error(chalk.red('No transcript found for this video. It may be disabled or unavailable.'));
    process.exit(1);
  }

  const fullText = transcriptToText(entries);
  const words = wordCount(fullText);
  console.log(chalk.green(`done  (${words.toLocaleString()} words)`));

  // Connect to LM Studio
  const client = new OpenAI({ baseURL: API_BASE, apiKey: 'lm-studio' });

  process.stdout.write(chalk.yellow('→ Checking LM Studio connection... '));
  try {
    await client.models.list();
    console.log(chalk.green('ok'));
  } catch (err) {
    process.stdout.write('\n');
    handleLLMError(err, model);
    process.exit(1);
  }

  // Generate notes
  let notes;

  if (words <= CHUNK_WORD_LIMIT) {
    process.stdout.write(chalk.yellow('→ Generating notes... '));
    try {
      notes = await callLLM(client, model, SINGLE_SYSTEM, fullText);
      console.log(chalk.green('done'));
    } catch (err) {
      process.stdout.write('\n');
      handleLLMError(err, model);
      process.exit(1);
    }
  } else {
    const chunks = chunkByWords(fullText, CHUNK_WORD_LIMIT);
    console.log(chalk.yellow(`→ Transcript too long — splitting into ${chunks.length} chunks...`));

    const partialNotes = [];
    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(chalk.yellow(`  Chunk ${i + 1}/${chunks.length}... `));
      try {
        const partial = await callLLM(client, model, CHUNK_SYSTEM(i + 1, chunks.length), chunks[i]);
        partialNotes.push(partial);
        console.log(chalk.green('done'));
      } catch (err) {
        process.stdout.write('\n');
        handleLLMError(err, model);
        process.exit(1);
      }
    }

    process.stdout.write(chalk.yellow('→ Synthesizing final notes... '));
    const combined = partialNotes.map((p, i) => `## Section ${i + 1}\n\n${p}`).join('\n\n---\n\n');
    try {
      notes = await callLLM(client, model, SYNTHESIS_SYSTEM, combined);
      console.log(chalk.green('done'));
    } catch (err) {
      process.stdout.write('\n');
      handleLLMError(err, model);
      process.exit(1);
    }
  }

  // Output
  if (viewMode) {
    console.log('\n' + chalk.dim('─'.repeat(60)) + '\n');
    renderToTerminal(notes);
    console.log(chalk.dim('─'.repeat(60)));
  }

  if (saveMode) {
    mkdirSync(outputPath, { recursive: true });
    const filepath = getOutputFilePath(notes, outputPath);
    const frontmatter = [
      '---',
      `source: "${url}"`,
      `video_id: "${videoId}"`,
      `model: "${model}"`,
      `generated: "${new Date().toISOString()}"`,
      `words_in_transcript: ${words}`,
      '---',
      '',
      '',
    ].join('\n');
    writeFileSync(filepath, frontmatter + notes + '\n');
    console.log(chalk.bold.green(`\n  Saved → ${filepath}\n`));
  }
}

main().catch(err => {
  console.error(chalk.red(`\nUnexpected error: ${err.message}`));
  process.exit(1);
});
