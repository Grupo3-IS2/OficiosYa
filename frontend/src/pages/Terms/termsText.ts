/** A block of the terms: a section heading ("1. Qué es OficiosYa") or a paragraph. */
export type TermsBlock = { kind: 'heading' | 'paragraph'; text: string }

export interface Terms {
  title: string
  /** The line under the title, such as the date of the last change; empty if there is none. */
  subtitle: string
  blocks: TermsBlock[]
}

// "1. Título" or "1) Título": a numbered line on its own starts a section.
const SECTION = /^\d+[.)]\s+\S/

/**
 * Reads terminos.txt, written as plain text so anyone can edit it: the first line is the title and the second,
 * if it isn't blank, goes under it; then a blank line separates paragraphs, and a numbered line starts a section.
 */
export function parseTerms(source: string): Terms {
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim())
  while (lines.length > 0 && !lines[0]) lines.shift()

  const title = lines.shift() ?? ''
  const subtitle = lines[0] ? lines.shift() ?? '' : ''

  const blocks: TermsBlock[] = []
  let paragraph: string[] = []
  const closeParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }

  for (const line of lines) {
    if (!line) {
      closeParagraph()
    } else if (SECTION.test(line)) {
      closeParagraph()
      blocks.push({ kind: 'heading', text: line })
    } else {
      paragraph.push(line)
    }
  }
  closeParagraph()

  return { title, subtitle, blocks }
}
