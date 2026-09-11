/**
 * ufret などから抽出した譜面データを ChordPro (Grid 形式) に変換する純粋関数群。
 * DOM の知識を持たないこと。
 */

/** @typedef {{ chord: string|null, text: string }} ExtractedCell */
/** @typedef {{ cells: ExtractedCell[], sectionBreak?: boolean }} ExtractedRow */
/**
 * @typedef {Object} ExtractedSheet
 * @property {string} title
 * @property {string} artist
 * @property {number|null} capoOffset 原曲キーからの半音オフセット (ufret の capo 属性)
 * @property {ExtractedRow[]} rows
 */

/**
 * ChordPro のディレクティブ記法と衝突する記号を全角に置換する。
 * `|` は {lyrics_hint} のセグメント区切りと、`{` `}` はディレクティブ行の
 * 波括弧 (src/lib/chordpro/parser.ts の /^\{([^}]+)\}$/) と衝突するため、
 * 生の値のまま出力するとその行がディレクティブとして認識されなくなる。
 *
 * @param {string} value
 * @returns {string}
 */
function escapeForChordPro(value) {
  return value.replace(/\|/g, '｜').replace(/\{/g, '｛').replace(/\}/g, '｝')
}

/**
 * total 小節を weights の比で配分する (最大剰余法)。各要素に最低 1 小節を保証する。
 * weights の要素数が total 以上のときは配分せず全要素 1 を返す。
 *
 * @param {number[]} weights 各 1 以上
 * @param {number} total
 * @returns {number[]}
 */
export function distribute(weights, total) {
  const n = weights.length
  if (n === 0) return []
  if (n >= total) return weights.map(() => 1)

  const sum = weights.reduce((a, b) => a + b, 0)
  const extra = total - n
  const shares = weights.map(w => (extra * w) / sum)
  const counts = shares.map(share => 1 + Math.floor(share))

  let rest = total - counts.reduce((a, b) => a + b, 0)
  const byFraction = shares
    .map((share, index) => ({ fraction: share - Math.floor(share), index }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (let k = 0; rest > 0; k++, rest--) {
    counts[byFraction[k].index] += 1
  }

  return counts
}

/**
 * 文字列を parts 個に前詰めで分割する。余りは先頭側の要素へ 1 文字ずつ配る。
 *
 * @param {string} text
 * @param {number} parts
 * @returns {string[]}
 */
export function splitText(text, parts) {
  if (parts <= 1) return [text]
  const result = Array.from({ length: parts }, () => '')
  if (text.length === 0) return result
  const base = Math.floor(text.length / parts)
  let remainder = text.length % parts
  let cursor = 0
  for (let i = 0; i < parts; i++) {
    const size = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder -= 1
    result[i] = text.slice(cursor, cursor + size)
    cursor += size
  }
  return result
}

/** @typedef {{ chord: string, hint: string }} ConvertedMeasure */
/** @typedef {{ measures: ConvertedMeasure[], hasLyrics: boolean, blockStart?: boolean }} ConvertedRow */

/**
 * 行のセルを「コード + それに続くコード無しセルの歌詞」に畳む。
 * 行頭のコード無しセル (前行からの歌詞の続き) は leading として分離する。
 *
 * @param {ExtractedCell[]} cells
 * @returns {{ leading: string, groups: { chord: string, text: string }[] }}
 */
function groupCellsByChord(cells) {
  let leading = ''
  const groups = []
  for (const cell of cells) {
    if (cell.chord) {
      groups.push({ chord: cell.chord, text: cell.text })
    } else if (groups.length > 0) {
      groups[groups.length - 1].text += cell.text
    } else {
      leading += cell.text
    }
  }
  return { leading, groups }
}

/**
 * 抽出した行を小節列に変換する。
 *
 * @param {ExtractedRow[]} rows
 * @param {number} measuresPerRow 基準小節数 ({time:} の分子)
 * @returns {ConvertedRow[]}
 */
export function convertRows(rows, measuresPerRow) {
  /** @type {ConvertedRow[]} */
  const converted = []

  for (const row of rows) {
    const { leading, groups } = groupCellsByChord(row.cells)
    const trimmedLeading = leading.trim()

    if (trimmedLeading) {
      if (converted.length === 0) {
        // 先頭行の行頭歌詞はぶら下がるコードが無いので捨てる
      } else if (row.sectionBreak) {
        // セクション境界を跨いで前行へ連結すると別セクションに歌詞が付くため、
        // この行の先頭コードの歌詞へ前置きする
        if (groups.length > 0) groups[0].text = trimmedLeading + groups[0].text
      } else {
        const previous = converted[converted.length - 1]
        const lastMeasure = previous.measures[previous.measures.length - 1]
        if (lastMeasure) {
          lastMeasure.hint += trimmedLeading
          previous.hasLyrics = true
        }
      }
    }

    if (groups.length === 0) continue

    const hasLyrics = groups.some(group => group.text.trim().length > 0)
    const counts =
      groups.length >= measuresPerRow || !hasLyrics
        ? groups.map(() => 1)
        : distribute(groups.map(group => Math.max(group.text.length, 1)), measuresPerRow)

    /** @type {ConvertedMeasure[]} */
    const measures = []
    groups.forEach((group, index) => {
      const chunks = splitText(group.text.trim(), counts[index])
      for (let repeat = 0; repeat < counts[index]; repeat++) {
        measures.push({ chord: group.chord, hint: chunks[repeat] })
      }
    })

    converted.push({ measures, hasLyrics, blockStart: row.sectionBreak === true })
  }

  return converted
}

/** @typedef {{ label: string, rows: ConvertedRow[] }} ConvertedSection */

/**
 * 歌詞の有無が切り替わる境目でセクションを分割し、ラベルを付ける。
 * ufret はセクション見出しを持たないため、これが唯一の構造の手がかりになる。
 *
 * @param {ConvertedRow[]} rows
 * @returns {ConvertedSection[]}
 */
export function splitSections(rows) {
  /** @type {{ hasLyrics: boolean, rows: ConvertedRow[] }[]} */
  const blocks = []
  for (const row of rows) {
    const last = blocks[blocks.length - 1]
    if (!last || row.blockStart || last.hasLyrics !== row.hasLyrics) {
      blocks.push({ hasLyrics: row.hasLyrics, rows: [row] })
    } else {
      last.rows.push(row)
    }
  }

  let verseNumber = 0
  let interludeNumber = 0

  return blocks.map((block, index) => {
    let label
    if (block.hasLyrics) {
      verseNumber += 1
      label = `Verse ${verseNumber}`
    } else if (index === 0) {
      label = 'Intro'
    } else if (index === blocks.length - 1) {
      label = 'Outro'
    } else {
      interludeNumber += 1
      label = `Interlude ${interludeNumber}`
    }
    return { label, rows: block.rows }
  })
}

/**
 * time (拍子) の分子を 1 行あたりの小節数として取り出す。
 * 分子が欠落・非数値・0 以下など不正な場合は 4 にフォールバックする。
 *
 * src/lib/chordpro/parser.ts の parseBeatsPerMeasure と同じフォールバック方針をここに
 * 複製したもの。拡張機能はビルドレスの独立ファイル群として配布するため src/ からは import しない。
 *
 * @param {string} [time]
 * @returns {number}
 */
function parseMeasuresPerRow(time) {
  if (!time) return 4
  const [beats] = time.split('/')
  const parsed = Number.parseInt(beats ?? '4', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4
}

/**
 * 抽出した譜面を Grid 形式の ChordPro 文字列に変換する。
 *
 * ufret は BPM も拍子も持たないため tempo/time は既定値を置く。myol 側で直す前提。
 * options.time の分子が不正な場合、小節数は 4 にフォールバックする (parseMeasuresPerRow 参照)。
 *
 * @param {ExtractedSheet} sheet
 * @param {{ tempo?: number, time?: string }} [options]
 * @returns {string}
 */
export function convertSheetToChordPro(sheet, options = {}) {
  const tempo = options.tempo ?? 120
  const time = options.time ?? '4/4'
  const measuresPerRow = parseMeasuresPerRow(time)

  const lines = [
    `{title: ${escapeForChordPro(sheet.title ?? '')}}`,
    `{artist: ${escapeForChordPro(sheet.artist ?? '')}}`
  ]

  // ufret の capo 属性は原曲キーからの半音オフセット。負値がカポ位置に対応する。
  const capo = sheet.capoOffset ? -sheet.capoOffset : 0
  if (capo > 0) lines.push(`{capo: ${capo}}`)

  lines.push(`{tempo: ${tempo}}`, `{time: ${time}}`, '')

  for (const section of splitSections(convertRows(sheet.rows, measuresPerRow))) {
    lines.push(`{start_of_grid label="${section.label}"}`)
    for (const row of section.rows) {
      if (row.hasLyrics) {
        const hints = row.measures.map(measure => escapeForChordPro(measure.hint))
        lines.push(`{lyrics_hint: ${hints.join(' | ')}}`)
      }
      lines.push(`| ${row.measures.map(measure => measure.chord).join(' | ')} |`)
    }
    lines.push('{end_of_grid}', '')
  }

  return lines.join('\n')
}
