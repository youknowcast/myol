let extractorPromise

function loadExtractor() {
  extractorPromise ??= import(chrome.runtime.getURL('extract.js'))
  return extractorPromise
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'MYOL_EXTRACT') return
  loadExtractor()
    .then(({ extractFromDocument }) => sendResponse(extractFromDocument(document)))
    .catch(() => sendResponse({ status: 'unsupported' }))
  return true
})
