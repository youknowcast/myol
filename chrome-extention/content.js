let extractorPromise

function loadExtractor() {
  if (!extractorPromise) {
    extractorPromise = import(chrome.runtime.getURL('extract.js')).catch((error) => {
      extractorPromise = undefined
      throw error
    })
  }
  return extractorPromise
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'MYOL_EXTRACT') return
  loadExtractor()
    .then(({ extractFromDocument }) => {
      try {
        sendResponse(extractFromDocument(document))
      } catch (error) {
        console.error(error)
        sendResponse({ status: 'unsupported' })
      }
    })
    .catch(() => sendResponse({ status: 'unsupported' }))
  return true
})
