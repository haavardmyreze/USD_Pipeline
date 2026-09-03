import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
hljs.registerLanguage('json', json)
const s = `{"a":1,"b":[true,null],"c":"x"}`
const raw = hljs.highlight(s,{language:'json'}).value
const stripped = raw.replace(/<span class="hljs-punctuation">([^<]*)<\/span>/g,'$1')
console.log('raw span count :', (raw.match(/<span/g)||[]).length)
console.log('stripped count :', (stripped.match(/<span/g)||[]).length)
console.log('stripped html  :', stripped)
