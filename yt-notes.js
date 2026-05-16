#!/usr/bin/env node
import { YoutubeTranscript } from 'youtube-transcript';
import OpenAI from 'openai';
import chalk from 'chalk';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DEFAULT_MODEL = 'google/gemma-4-e4b';
const API_BASE = 'http://127.0.0.1:1234/v1';
const CHUNK_WORD_LIMIT = 6000;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let url = null;
  let model = DEFAULT_MODEL;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--model' || args[i] === '-m') && args[i + 1]) {
      model = args[++i];
    } else if (!url && !args[i].startsWith('-')) {
      url = args[i];
    }
  }

  return { url, model };
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

const SINGLE_SYSTEM = `You are an expert note-taker. Given a YouTube video transcript, produce well-structured markdown notes. Include:
- A concise **title** reflecting the topic
- A short **overview** (2-4 sentences)
- **Key points** as a bulleted list
- **Details / deep-dives** as subsections where relevant
- **Takeaways** or action items

Use proper markdown headings, lists, and bold text. Do not wrap the output in a code block.`;

const CHUNK_SYSTEM = (n, total) =>
  `You are summarizing section ${n} of ${total} of a YouTube transcript. Extract the key ideas, facts, and arguments from this section into concise markdown notes. Be thorough — these partial notes will be combined later.`;

const SYNTHESIS_SYSTEM = `You are combining partial notes from different sections of a single YouTube video into one cohesive markdown document. Merge overlapping ideas, remove redundancy, and produce clean final notes with:
- A **title**
- An **overview**
- **Key points**
- **Details / deep-dives** grouped by theme (not by chunk)
- **Takeaways**

Use proper markdown. Do not wrap the output in a code block.`;

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
    console.error(chalk.red('\nError: Lost connection to LM Studio.'));
    console.error(chalk.dim(`Ensure LM Studio is running and the server is active at ${API_BASE}`));
  } else if (err.status === 404 || err.message?.includes('model')) {
    console.error(chalk.red(`\nError: Model "${model}" was not found.`));
    console.error(chalk.dim('Verify the model is loaded in LM Studio, or pass a different name with --model.'));
  } else {
    console.error(chalk.red(`\nLM Studio error: ${err.message}`));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { url, model } = parseArgs();

  if (!url) {
    console.error(chalk.red('Error: No YouTube URL provided.'));
    console.error(chalk.dim('Usage: node yt-notes.js <youtube-url> [--model <name>]'));
    process.exit(1);
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    console.error(chalk.red('Error: Invalid YouTube URL.'));
    console.error(chalk.dim('Supported formats: https://youtube.com/watch?v=ID  or  https://youtu.be/ID'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n  yt-notes'));
  console.log(chalk.dim(`  URL:   ${url}`));
  console.log(chalk.dim(`  Model: ${model}\n`));

  // Fetch transcript
  process.stdout.write(chalk.yellow('→ Fetching transcript... '));
  let entries;
  try {
    entries = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (err) {
    process.stdout.write('\n');
    const msg = err.message ?? '';
    if (
      msg.includes('disabled') ||
      msg.includes('No transcript') ||
      msg.includes('Could not get') ||
      msg.includes('not available')
    ) {
      console.error(chalk.red('Error: No transcript available for this video.'));
      console.error(chalk.dim('The video may have captions disabled or no auto-generated subtitles.'));
    } else {
      console.error(chalk.red(`Error fetching transcript: ${msg}`));
    }
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    process.stdout.write('\n');
    console.error(chalk.red('Error: Transcript came back empty.'));
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
    if (isConnectionError(err)) {
      console.error(chalk.red('Error: Cannot connect to LM Studio.'));
      console.error(chalk.dim(`Start LM Studio and enable the local server at ${API_BASE}`));
    } else {
      console.error(chalk.red(`Error: ${err.message}`));
    }
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
    console.log(
      chalk.yellow(`→ Transcript too long — splitting into ${chunks.length} chunks...`)
    );

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

  // Save to notes/
  mkdirSync('notes', { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename = `${timestamp}-${videoId}.md`;
  const filepath = join('notes', filename);

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

main().catch(err => {
  console.error(chalk.red(`\nUnexpected error: ${err.message}`));
  process.exit(1);
});
