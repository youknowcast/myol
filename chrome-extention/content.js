/**
 * ufret のコード譜 DOM から ExtractedSheet を抽出する。
 * ChordPro の知識は持たない (変換は popup 側の converter.js が行う)。
 *
 * `#my-chord-data` はページの静的 HTML に存在するが、`.chord-row` 要素はページ自身の
 * スクリプトが数秒後に注入する。そのため「まだ描画されていない」と「このページには
 * コード譜がそもそも無い」を区別できるよう、戻り値は status 付きの形にする:
 *   - { status: 'unsupported' } … #my-chord-data 自体が無い
 *   - { status: 'loading' }     … root はあるが .chord-row がまだ無い (描画待ち)
 *   - { status: 'ok', sheet }   … 抽出成功
 */

function extractSheet() {
  const root = document.querySelector('#my-chord-data')
  if (!root) return { status: 'unsupported' }

  const rowEls = root.querySelectorAll('.chord-row')
  if (rowEls.length === 0) return { status: 'loading' }

  const title = (document.querySelector('h1.p-detail-head__ttl')?.textContent || '').trim()
  const artist = (document.querySelector('a.p-detail-head__artist')?.textContent || '').replace(/\s+/g, ' ').trim()

  const capoAttr = root.getAttribute('capo')
  const capoOffset = capoAttr === null || capoAttr.trim() === '' || Number.isNaN(Number(capoAttr))
    ? null
    : Number(capoAttr)

  const rows = Array.from(rowEls).map((row) => ({
    cells: Array.from(row.querySelectorAll('p.chord')).map((cell) => ({
      chord: (cell.querySelector('rt')?.textContent || '').trim() || null,
      text: Array.from(cell.querySelectorAll('.mejiowvnz .col'))
        .map((col) => col.textContent || '')
        .join('')
    }))
  }))

  return { status: 'ok', sheet: { title, artist, capoOffset, rows } }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'MYOL_EXTRACT') {
    sendResponse(extractSheet())
  }
})
