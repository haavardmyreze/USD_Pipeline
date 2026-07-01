export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** Pure function of heading text — must match ids rendered in the document. */
export function headingId(text: string) {
  return slugify(text) || 'section'
}

export type SectionRef = {
  id: string
  text: string
  level: number
}
