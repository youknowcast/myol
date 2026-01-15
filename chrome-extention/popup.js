const button = document.getElementById('extract')
const status = document.getElementById('status')

function setStatus(message) {
  status.textContent = message
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({
    url,
    filename,
    saveAs: true
  }, () => {
    URL.revokeObjectURL(url)
  })
}

button.addEventListener('click', async () => {
  setStatus('Extracting...')
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) {
    setStatus('No active tab found.')
    return
  }

  chrome.tabs.sendMessage(tab.id, { type: 'MYOL_EXTRACT' }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus('Content script not available on this page.')
      return
    }
    if (!response || !response.text) {
      setStatus('No data found in page.')
      return
    }

    const headerLines = []
    if (response.title) headerLines.push(`{title: ${response.title}}`)
    if (response.artist) headerLines.push(`{artist: ${response.artist}}`)
    if (headerLines.length > 0) headerLines.push('')

    const chordProText = headerLines.length > 0
      ? `${headerLines.join('\n')}${response.text ? `\n${response.text}` : ''}`
      : response.text

    const rawTitle = response.title || 'chordpro'
    const rawArtist = response.artist || ''
    const safeTitle = rawTitle.replace(/[\\/:*?"<>|]+/g, '_').trim()
    const safeArtist = rawArtist.replace(/[\\/:*?"<>|]+/g, '_').trim()
    const baseName = [safeArtist, safeTitle].filter(Boolean).join('_') || 'chordpro'
    const filename = `${baseName}.cho`
    downloadText(filename, chordProText)
    setStatus('Downloaded.')
  })
})
