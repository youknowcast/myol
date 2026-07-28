import { convertSheetToChordPro } from './converter.js'

const downloadButton = document.getElementById('download')
const copyButton = document.getElementById('copy')
const statusEl = document.getElementById('status')

let chordPro = ''
let baseName = 'chordpro'

// content.js の .chord-row 描画はページの自前スクリプト任せで、実測で数秒かかることがある。
// ポップアップを開いた直後は "loading" が返ってくるのが正常系なので、数回リトライする。
const EXTRACT_RETRY_ATTEMPTS = 8
const EXTRACT_RETRY_DELAY_MS = 500

function setStatus(message) {
  statusEl.textContent = message
}

function sanitize(value) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim()
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * content.js に抽出を依頼する。content.js が反応しない (ufret 以外のページ・注入前など)
 * 場合も含め、常に { status, sheet? } の形で解決する。
 */
function requestSheet(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'MYOL_EXTRACT' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ status: 'unsupported' })
        return
      }
      resolve(response ?? { status: 'unsupported' })
    })
  })
}

async function requestSheetWithRetry(tabId) {
  let result = await requestSheet(tabId)
  for (let attempt = 0; result.status === 'loading' && attempt < EXTRACT_RETRY_ATTEMPTS; attempt++) {
    setStatus('読み込み中… コード譜の表示を待っています。')
    await delay(EXTRACT_RETRY_DELAY_MS)
    result = await requestSheet(tabId)
  }
  return result
}

/** 生成された ChordPro のグリッド行から、実際に変換された小節数を数える。 */
function countMeasures(text) {
  const gridLines = text.match(/^\|.*\|$/gm) ?? []
  return gridLines.reduce((sum, line) => sum + (line.split('|').length - 2), 0)
}

async function load() {
  setStatus('読み込み中…')

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    setStatus('アクティブなタブが見つかりません。')
    return
  }

  const result = await requestSheetWithRetry(tab.id)

  if (result.status === 'loading') {
    setStatus('コード譜の読み込みがタイムアウトしました。ページを再読み込みしてから、もう一度お試しください。')
    return
  }

  if (result.status !== 'ok' || !result.sheet) {
    setStatus('このページからコード譜を取得できませんでした。')
    return
  }

  const sheet = result.sheet
  chordPro = convertSheetToChordPro(sheet)
  baseName = [sanitize(sheet.artist || ''), sanitize(sheet.title || '')].filter(Boolean).join('_') || 'chordpro'

  const header = `${sheet.title || '(無題)'} / ${sheet.artist || '(不明)'}`

  // convertSheetToChordPro はコードが 1 つも無いとメタデータ行だけを返す
  // ({start_of_grid} が無い)。行数だけでは判定できないので、実際の変換結果を見る。
  if (!chordPro.includes('{start_of_grid')) {
    setStatus(`${header}\nコードが見つからなかったため変換できませんでした。`)
    return
  }

  setStatus(`${header}\n${countMeasures(chordPro)} 小節を変換しました。`)

  downloadButton.disabled = false
  copyButton.disabled = false
}

downloadButton.addEventListener('click', () => {
  const blob = new Blob([chordPro], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({ url, filename: `${baseName}.cho`, saveAs: true }, (downloadId) => {
    URL.revokeObjectURL(url)
    if (chrome.runtime.lastError || downloadId === undefined) {
      setStatus('ダウンロードに失敗しました。')
      return
    }
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
