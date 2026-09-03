import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
hljs.registerLanguage('json', json)
const content = `{
  "name": "x",
  "n": 1,
  "b": true
}
`
const nl = (content.match(/\n/g)||[]).length
console.log('countCodeLines (nl+1):', nl+1)
const raw = hljs.highlight(content,{language:'json'}).value
const stripped = raw.replace(/<span class="hljs-punctuation">([^<]*)<\/span>/g,'$1')
// replicate splitHighlightedLines line count = (# of \n in stripped)+1
const lines = stripped.split('\n')
console.log('highlighted line count :', lines.length)
console.log('first line raw         :', JSON.stringify(lines[0]))
console.log('last line raw          :', JSON.stringify(lines[lines.length-1]))
