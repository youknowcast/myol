/** @typedef {{ chord: string|null, text: string }} ExtractedCell */
/** @typedef {{ cells: ExtractedCell[], sectionBreak?: boolean }} ExtractedRow */
/**
 * @typedef {Object} ExtractedSheet
 * @property {string} title
 * @property {string} artist
 * @property {number|null} capoOffset
 * @property {ExtractedRow[]} rows
 */

const CHORD_TOKEN = /\[.+?\]/g

/** @param {string} value */
function normalizeText(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** @param {string} chord @returns {string|null} */
function normalizeChord(chord) {
  const trimmed = chord.trim()
  const compact = trimmed.replace(/[\s\u3000]/g, '')
  if (compact === '' || compact === '/' || compact === 'N.C.' || compact === 'N.C' || compact === 'NC') {
    return null
  }
  return trimmed
}

/**
 * ソース中の `var ufret_chord_datas = [...]` の配列リテラルだけを切り出す。
 * 文字列内の `]` を数えないよう quote/escape を追跡する。
 * @param {string} source
 * @param {number} startIndex
 * @returns {string|null}
 */
function sliceArrayLiteral(source, startIndex) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return source.slice(startIndex, i + 1)
    }
  }
  return null
}

/**
 * @param {string} source HTML または JS 断片
 * @returns {string[]|null}
 */
export function parseChordDatas(source) {
  const anchor = source.search(/var\s+ufret_chord_datas\s*=/)
  if (anchor === -1) return null
  const start = source.indexOf('[', anchor)
  if (start === -1) return null
  const literal = sliceArrayLiteral(source, start)
  if (!literal) return null
  try {
    const parsed = JSON.parse(literal)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * @param {string} source
 * @returns {{ title: string, artist: string }}
 */
export function parseMeta(source) {
  const titleMatch = source.match(/<h1[^>]*class="[^"]*p-detail-head__ttl[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
  const artistMatch = source.match(/<a[^>]*class="[^"]*p-detail-head__artist[^"]*"[^>]*>([\s\S]*?)<\/a>/)
  return {
    title: titleMatch ? normalizeText(titleMatch[1]) : '',
    artist: artistMatch ? normalizeText(artistMatch[1]) : ''
  }
}

/** @param {string} line @returns {ExtractedCell[]} */
function cellsFromLine(line) {
  const segments = line.split(/\[.+?\]/)
  const chords = line.match(CHORD_TOKEN) || []
  const cells = []
  const leading = segments[0] ?? ''
  if (leading !== '') cells.push({ chord: null, text: leading })
  chords.forEach((token, index) => {
    cells.push({ chord: normalizeChord(token.slice(1, -1)), text: segments[index + 1] ?? '' })
  })
  return cells
}

/**
 * @param {string[]} chordDatas
 * @param {{ title?: string, artist?: string, capoOffset?: number|null }} meta
 * @returns {ExtractedSheet}
 */
export function buildSheet(chordDatas, meta = {}) {
  const rows = []
  let pendingBreak = false
  for (const raw of chordDatas) {
    const line = String(raw).replace(/\r$/, '').replace(/^\ufeff/, '')
    if (line.trim() === '') {
      pendingBreak = true
      continue
    }
    const row = { cells: cellsFromLine(line) }
    if (pendingBreak) row.sectionBreak = true
    pendingBreak = false
    rows.push(row)
  }
  return {
    title: meta.title ?? '',
    artist: meta.artist ?? '',
    capoOffset: meta.capoOffset ?? null,
    rows
  }
}

/**
 * @param {string[]} scriptTexts 各 inline script の textContent
 * @returns {string[]|null}
 */
export function findChordDatas(scriptTexts) {
  for (const text of scriptTexts) {
    if (!text.includes('ufret_chord_datas')) continue
    const datas = parseChordDatas(text)
    if (datas) return datas
  }
  return null
}

/**
 * @param {string} html
 * @returns {{ status: 'unsupported'|'ok', sheet?: ExtractedSheet }}
 */
export function extractFromHtml(html) {
  const chordDatas = parseChordDatas(html)
  if (!chordDatas) return { status: 'unsupported' }
  return { status: 'ok', sheet: buildSheet(chordDatas, { ...parseMeta(html), capoOffset: null }) }
}

/** @param {Document} doc */
function metaFromDocument(doc) {
  return {
    title: normalizeText(doc.querySelector('h1.p-detail-head__ttl')?.textContent ?? ''),
    artist: normalizeText(doc.querySelector('a.p-detail-head__artist')?.textContent ?? '')
  }
}

/** @param {Document} doc @returns {number|null} */
function capoOffsetFromDocument(doc) {
  const attr = doc.querySelector('#my-chord-data')?.getAttribute('capo') ?? null
  if (attr === null || attr.trim() === '' || Number.isNaN(Number(attr))) return null
  return Number(attr)
}

/**
 * @param {Document} doc
 * @returns {{ status: 'unsupported'|'loading'|'ok', sheet?: ExtractedSheet }}
 */
export function extractFromDocument(doc) {
  const chordDatas = findChordDatas(
    Array.from(doc.querySelectorAll('script')).map((script) => script.textContent ?? '')
  )
  const capoOffset = capoOffsetFromDocument(doc)

  if (chordDatas) {
    return { status: 'ok', sheet: buildSheet(chordDatas, { ...metaFromDocument(doc), capoOffset }) }
  }

  const root = doc.querySelector('#my-chord-data')
  if (!root) return { status: 'unsupported' }
  const rowEls = root.querySelectorAll('.chord-row')
  if (rowEls.length === 0) return { status: 'loading' }

  const rows = Array.from(rowEls).map((row) => ({
    cells: Array.from(row.querySelectorAll('p.chord')).map((cell) => ({
      chord: (cell.querySelector('rt')?.textContent ?? '').trim() || null,
      text: Array.from(cell.querySelectorAll('.mejiowvnz .col'))
        .map((col) => col.textContent ?? '')
        .join('')
    }))
  }))

  return { status: 'ok', sheet: { ...metaFromDocument(doc), capoOffset, rows } }
}
