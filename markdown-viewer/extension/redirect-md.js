(function redirectMarkdownPage() {
  if (window.top !== window.self) {
    return
  }

  const current = window.location.href
  if (!/\.(md|markdown)(?:$|[?#])/i.test(current)) {
    return
  }

  if (isFileMarkdownUrl(current)) {
    browser.runtime.sendMessage({ type: 'open-markdown', url: current })
    return
  }

  const target = viewerMarkdownUrl(current)
  if (current === target) {
    return
  }

  window.location.replace(target)
})()
