import sanitizeHtml from "sanitize-html";

export const escapeEmailHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function safeEmailHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr", "pre", "img"],
    allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "width", "height"], "*": ["style"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: ["https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "cid"] },
    allowProtocolRelative: false,
    allowedStyles: { "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i], "background-color": [/^#[0-9a-f]{3,8}$/i],
      "text-align": [/^(left|right|center)$/], "font-weight": [/^(normal|bold|[1-9]00)$/],
      "font-size": [/^\d{1,2}(px|pt)$/], "font-family": [/^[a-zA-Z ,'-]+$/],
      "white-space": [/^(pre-wrap|pre-line|normal)$/], padding: [/^[\d.]+(px|pt)( [\d.]+(px|pt))*$/],
      border: [/^\dpx solid #[0-9a-f]{3,8}$/i], "border-collapse": [/^collapse$/],
    } },
  });
}

export function emailHtmlFromText(text: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escapeEmailHtml(text)}</div>`;
}

export function fillEmailHtml(template: string, values: Record<string, unknown>): string {
  return safeEmailHtml(template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
    (match, key) => Object.hasOwn(values, key) ? escapeEmailHtml(String(values[key] ?? "")) : match));
}

export function validateAttachments(files: { fileName: string; contentType: string; bytes: Uint8Array }[]): string | null {
  if (files.length > 5) return "Attach at most five files.";
  if (files.reduce((sum, file) => sum + file.bytes.byteLength, 0) > 10 * 1024 * 1024) return "Attachments must total 10 MB or less.";
  for (const file of files) {
    if (!file.fileName || file.fileName.length > 180 || /[\x00-\x1f\\/]/.test(file.fileName)) return "Use a valid attachment filename.";
    if (!/\.(pdf|png|jpe?g|txt|csv|docx|xlsx)$/i.test(file.fileName)) return "Use PDF, PNG, JPG, TXT, CSV, DOCX or XLSX attachments.";
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.contentType)) return "Invalid attachment content type.";
    if (!file.bytes.byteLength) return "An attachment is empty.";
  }
  return null;
}
