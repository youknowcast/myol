#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFromHtml } from '../chrome-extention/extract.js'
import { convertSheetToChordPro } from '../chrome-extention/converter.js'

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'ja'
}

export function sanitize(value) {
  return String(value ?? '').replace(/[\\/:*?"<>|]+/g, '_').trim()
}

export function resolveOutputDir({ out, env = process.env } = {}) {
  if (out) return path.resolve(out)
  if (env.MYOL_SONGS_DIR) return path.resolve(env.MYOL_SONGS_DIR)
  return path.join(homedir(), 'Music', 'myol')
}

export function buildFileName(sheet, name) {
  const base = name
    ? name
    : [sanitize(sheet.artist), sanitize(sheet.title)].filter(Boolean).join('_') || 'chordpro'
  return base.endsWith('.cho') ? base : `${base}.cho`
}

function parseArgs(argv) {
  const args = { url: null, out: null, name: null, stdout: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') args.out = argv[++i]
    else if (arg === '--name') args.name = argv[++i]
    else if (arg === '--stdout') args.stdout = true
    else if (!args.url) args.url = arg
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url) {
    throw new Error('Usage: node scripts/import-ufret.mjs <url> [--out DIR] [--name NAME] [--stdout]')
  }

  const response = await fetch(args.url, { headers: DEFAULT_HEADERS, redirect: 'follow' })
  if (!response.ok) throw new Error(`Failed to fetch ${args.url}: HTTP ${response.status}`)

  const result = extractFromHtml(await response.text())
  if (result.status !== 'ok' || !result.sheet) {
    throw new Error('No ufret chord data found on this page')
  }

  const chordPro = convertSheetToChordPro(result.sheet)
  if (!chordPro.includes('{start_of_grid')) throw new Error('No chords found after conversion')

  if (args.stdout) {
    process.stdout.write(chordPro)
    return
  }

  const dir = resolveOutputDir({ out: args.out })
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, buildFileName(result.sheet, args.name))
  await writeFile(filePath, chordPro, 'utf8')
  process.stdout.write(`Saved: ${filePath}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
