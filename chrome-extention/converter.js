/**
 * ufret などから抽出した譜面データを ChordPro (Grid 形式) に変換する純粋関数群。
 * DOM の知識を持たないこと。
 */

/** @typedef {{ chord: string|null, text: string }} ExtractedCell */
/** @typedef {{ cells: ExtractedCell[] }} ExtractedRow */
/**
 * @typedef {Object} ExtractedSheet
 * @property {string} title
 * @property {string} artist
 * @property {number|null} capoOffset 原曲キーからの半音オフセット (ufret の capo 属性)
 * @property {ExtractedRow[]} rows
 */

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
