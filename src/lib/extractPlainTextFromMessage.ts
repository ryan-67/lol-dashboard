/** Plain text for clipboard — strips chart blocks and markdown bold markers. */
export function extractPlainTextFromAssistantMessage(content: string): string {
  let text = content.replace(/```chart[\s\S]*?```/gi, '')
  text = text.replace(/(?:^|\n)chart\s*\n\{[\s\S]*?\}(?=\n\n|\n(?![\s"{\[])|$)/gi, '')
  text = text.replace(/\*\*(.*?)\*\*/g, '$1')
  return text.replace(/\n{3,}/g, '\n\n').trim()
}
