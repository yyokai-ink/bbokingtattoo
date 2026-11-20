/** Safe inline JSON-LD: `<` is escaped so user content can never close the <script> tag (XSS). */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
