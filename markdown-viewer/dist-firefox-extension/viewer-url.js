const VIEWER_ORIGIN = 'https://usd-pipeline-k7aa.vercel.app'

function viewerHomeUrl() {
  return `${VIEWER_ORIGIN}/`
}

function viewerMarkdownUrl(markdownUrl) {
  const url = new URL(VIEWER_ORIGIN)
  if (markdownUrl) {
    url.searchParams.set('src', markdownUrl)
  }
  return url.toString()
}

function isFileMarkdownUrl(url) {
  try {
    return new URL(url).protocol === 'file:'
  } catch {
    return false
  }
}
