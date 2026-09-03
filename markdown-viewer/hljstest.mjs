import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
hljs.registerLanguage('json', json)
const sample = `{
  "name": "quiet-reader",
  "version": 2,
  "active": true,
  "tags": ["md", "json"],
  "nested": { "x": null }
}`
const out = hljs.highlight(sample, { language: 'json' }).value
console.log(out)
console.log('\n--- classes used ---')
console.log([...new Set([...out.matchAll(/hljs-([\w-]+)/g)].map(m=>m[1]))].join(', '))
