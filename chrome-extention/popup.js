import { convertSheetToChordPro } from './converter.js'

const downloadButton = document.getElementById('download')
const copyButton = document.getElementById('copy')
const statusEl = document.getElementById('status')

let chordPro = ''
let baseName = 'chordpro'

function setStatus(message) {
  statusEl.textContent = message
}

function sanitize(value) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim()
}

function requestSheet(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'MYOL_EXTRACT' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null)
        return
      }
      resolve(response?.sheet ?? null)
    })
  })
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    setStatus('アクティブなタブが見つかりません。')
    return
  }

  const sheet = await requestSheet(tab.id)
  if (!sheet) {
    setStatus('このページからコード譜を取得できませんでした。')
    return
  }

  chordPro = convertSheetToChordPro(sheet)
  baseName = [sanitize(sheet.artist || ''), sanitize(sheet.title || '')].filter(Boolean).join('_') || 'chordpro'

  setStatus(`${sheet.title || '(無題)'} / ${sheet.artist || '(不明)'}\n${sheet.rows.length} 行を変換しました。`)

  downloadButton.disabled = false
  copyButton.disabled = false
}

downloadButton.addEventListener('click', () => {
  const blob = new Blob([chordPro], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({ url, filename: `${baseName}.cho`, saveAs: true }, () => {
    URL.revokeObjectURL(url)
    setStatus('ダウンロードしました。')
  })
})

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(chordPro)
    setStatus('クリップボードにコピーしました。')
  } catch {
    setStatus('コピーに失敗しました。')
  }
})

void load()
