function extractChordProFromPage() {
  const root = document.querySelector('#my-chord-data')
  if (!root) return { text: '' }

  const nameEl = document.querySelector('.show_name')
  const artistEl = document.querySelector('.show_artist')
  const title = (nameEl?.textContent || document.title || '').trim()
  const artist = (artistEl?.textContent || '').replace(/\s+/g, ' ').trim()

  const lines = []
  const rows = root.querySelectorAll('.chord-row')

  rows.forEach((row) => {
    let line = ''
    const chordBlocks = row.querySelectorAll('p.chord')

    chordBlocks.forEach((p) => {
      const chord = (p.querySelector('rt')?.textContent || '').trim()
      const lyric = Array.from(p.querySelectorAll('.mejiowvnz .col'))
        .map((el) => el.textContent || '')
        .join('')

      if (chord) {
        line += `[${chord}]${lyric}`
      } else {
        line += lyric
      }
    })

    if (line.trim()) {
      lines.push(line)
    }
  })

  const text = lines.join('\n')
  return { text, title, artist }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'MYOL_EXTRACT') {
    sendResponse(extractChordProFromPage())
  }
})
