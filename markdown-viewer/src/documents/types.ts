export type DocumentFormat = 'markdown' | 'pdf' | 'csv' | 'image' | 'code'

export type DocumentSource =
  | { format: 'markdown'; content: string }
  | { format: 'pdf'; data: ArrayBuffer }
  | { format: 'csv'; content: string }
  | { format: 'image'; data: ArrayBuffer; fileName: string }
  | { format: 'code'; content: string; language?: string }
