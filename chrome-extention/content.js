/**
 * ufret のコード譜 DOM から ExtractedSheet を抽出する。
 * ChordPro の知識は持たない (変換は popup 側の converter.js が行う)。
 */

function extractSheet() {
  const root = document.querySelector('#my-chord-data')
  if (!root) return null

  const title = (document.querySelector('h1.p-detail-head__ttl')?.textContent || '').trim()
  const artist = (document.querySelector('a.p-detail-head__artist')?.textContent || '').replace(/\s+/g, ' ').trim()

  const capoAttr = root.getAttribute('capo')
  const capoOffset = capoAttr === null || capoAttr.trim() === '' || Number.isNaN(Number(capoAttr))
    ? null
    : Number(capoAttr)

  const rows = Array.from(root.querySelectorAll('.chord-row')).map((row) => ({
    cells: Array.from(row.querySelectorAll('p.chord')).map((cell) => ({
      chord: (cell.querySelector('rt')?.textContent || '').trim() || null,
      text: Array.from(cell.querySelectorAll('.mejiowvnz .col'))
        .map((col) => col.textContent || '')
        .join('')
    }))
  }))

  if (rows.length === 0) return null

  return { title, artist, capoOffset, rows }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'MYOL_EXTRACT') {
    sendResponse({ sheet: extractSheet() })
  }
})
