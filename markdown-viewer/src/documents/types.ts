export type DocumentFormat = 'markdown' | 'pdf' | 'csv' | 'image'

export type DocumentSource =
  | { format: 'markdown'; content: string }
  | { format: 'pdf'; data: ArrayBuffer }
  | { format: 'csv'; content: string }
  | { format: 'image'; data: ArrayBuffer; fileName: string }
