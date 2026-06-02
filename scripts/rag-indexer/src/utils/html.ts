import { convert } from 'html-to-text'

export function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'nav', format: 'skip' },
      { selector: 'footer', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } },
    ],
  })
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export function extractHrefPaths(html: string, pattern: RegExp): string[] {
  const paths = new Set<string>()
  const re = /href="(\/leagueoflegends\/[^"#?]+)"/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const path = decodeURIComponent(match[1].replace(/^\/leagueoflegends\//, ''))
    if (pattern.test(path)) {
      paths.add(path)
    }
  }
  return [...paths]
}

export function extractLoLNewsLinks(html: string): string[] {
  const links = new Set<string>()
  const re = /href="(\/en-us\/news\/[^"#?]+)"/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    links.add(`https://www.leagueoflegends.com${match[1]}`)
  }
  return [...links]
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
