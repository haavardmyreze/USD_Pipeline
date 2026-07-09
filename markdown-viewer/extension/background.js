const MENU_OPEN_LINK = 'quiet-reader-open-link'
const MENU_OPEN_PAGE = 'quiet-reader-open-page'

function isMarkdownUrl(url) {
  if (!url) {
    return false
  }

  try {
    const parsed = new URL(url)
    return /\.(md|markdown)$/i.test(parsed.pathname)
  } catch {
    return false
  }
}

async function markdownDataUrl(markdownUrl) {
  const response = await fetch(markdownUrl)
  if (!response.ok) {
    throw new Error(`Could not read markdown (${response.status})`)
  }

  const text = await response.text()
  return `data:text/markdown;charset=utf-8,${encodeURIComponent(text)}`
}

async function resolveViewerUrl(markdownUrl) {
  if (!isFileMarkdownUrl(markdownUrl)) {
    return viewerMarkdownUrl(markdownUrl)
  }

  try {
    return viewerMarkdownUrl(await markdownDataUrl(markdownUrl))
  } catch (error) {
    console.warn('Quiet Reader: falling back to file URL for viewer', error)
    return viewerMarkdownUrl(markdownUrl)
  }
}

async function openMarkdownInViewer(markdownUrl, tabId) {
  const target = await resolveViewerUrl(markdownUrl)

  if (typeof tabId === 'number') {
    await browser.tabs.update(tabId, { url: target })
    return
  }

  await browser.tabs.create({ url: target })
}

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_OPEN_LINK,
    title: 'Open Markdown in Quiet Reader',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/*.md', '*://*/*.markdown', 'file://*/*.md', 'file://*/*.markdown'],
  })

  browser.contextMenus.create({
    id: MENU_OPEN_PAGE,
    title: 'Open This Page in Quiet Reader',
    contexts: ['page'],
    documentUrlPatterns: [
      '*://*/*.md',
      '*://*/*.markdown',
      'file://*/*.md',
      'file://*/*.markdown',
    ],
  })
})

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'open-markdown' || !isMarkdownUrl(message.url)) {
    return
  }

  void openMarkdownInViewer(message.url, sender.tab?.id)
})

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_OPEN_LINK && isMarkdownUrl(info.linkUrl)) {
    void openMarkdownInViewer(info.linkUrl)
    return
  }

  if (info.menuItemId === MENU_OPEN_PAGE && tab?.url && isMarkdownUrl(tab.url)) {
    void openMarkdownInViewer(tab.url, tab.id)
  }
})

browser.browserAction.onClicked.addListener(() => {
  void browser.tabs.create({ url: viewerHomeUrl() })
})
