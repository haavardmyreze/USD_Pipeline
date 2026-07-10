export type DocumentFormat = 'markdown' | 'pdf' | 'csv'

export type DocumentSource =
  | { format: 'markdown'; content: string }
  | { format: 'pdf'; data: ArrayBuffer }
  | { format: 'csv'; content: string }
