/**
 * Document Export & Serialization Utilities
 * Supports exporting Tiptap JSON documents to:
 *  - Markdown (.md)
 *  - Plain text (.txt)
 *  - Document word and character statistics
 *  - Client-side blob downloading
 */

export function tiptapToMarkdown(doc: Record<string, unknown> | null | undefined): string {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.content)) return "";

  const lines: string[] = [];

  function serializeNode(node: Record<string, unknown>, listPrefix?: string): string {
    const type = node.type as string;
    const content = Array.isArray(node.content) ? (node.content as Record<string, unknown>[]) : [];
    const attrs = (node.attrs as Record<string, unknown>) || {};

    if (type === "text") {
      let text = String(node.text || "");
      const marks = Array.isArray(node.marks) ? (node.marks as Record<string, unknown>[]) : [];
      for (const mark of marks) {
        if (mark.type === "bold") text = `**${text}**`;
        else if (mark.type === "italic") text = `*${text}*`;
        else if (mark.type === "strike") text = `~~${text}~~`;
        else if (mark.type === "link" && mark.attrs && typeof mark.attrs === "object") {
          const href = (mark.attrs as Record<string, unknown>).href || "";
          text = `[${text}](${href})`;
        }
      }
      return text;
    }

    if (type === "paragraph") {
      return content.map((c) => serializeNode(c)).join("");
    }

    if (type === "heading") {
      const level = Math.min(Math.max(Number(attrs.level || 1), 1), 6);
      const prefix = "#".repeat(level) + " ";
      return prefix + content.map((c) => serializeNode(c)).join("");
    }

    if (type === "blockquote") {
      const inner = content.map((c) => serializeNode(c)).join("\n");
      return inner
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    }

    if (type === "bulletList") {
      return content.map((item) => serializeNode(item, "- ")).join("\n");
    }

    if (type === "orderedList") {
      return content
        .map((item, idx) => serializeNode(item, `${idx + 1}. `))
        .join("\n");
    }

    if (type === "listItem") {
      const inner = content.map((c) => serializeNode(c)).join("\n");
      return (listPrefix || "- ") + inner;
    }

    if (type === "hardBreak") {
      return "  \n";
    }

    return content.map((c) => serializeNode(c)).join("");
  }

  for (const node of doc.content as Record<string, unknown>[]) {
    const rendered = serializeNode(node);
    lines.push(rendered);
  }

  return lines.join("\n\n").trim();
}

export function tiptapToPlainText(doc: Record<string, unknown> | null | undefined): string {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.content)) return "";

  const paragraphs: string[] = [];

  function extractText(node: Record<string, unknown>): string {
    if (node.type === "text") return String(node.text || "");
    if (Array.isArray(node.content)) {
      return (node.content as Record<string, unknown>[]).map(extractText).join("");
    }
    return "";
  }

  for (const node of doc.content as Record<string, unknown>[]) {
    const text = extractText(node).trim();
    if (text) paragraphs.push(text);
  }

  return paragraphs.join("\n\n");
}

export function getDocumentStats(doc: Record<string, unknown> | null | undefined): { words: number; chars: number } {
  const text = tiptapToPlainText(doc);
  if (!text.trim()) return { words: 0, chars: 0 };
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  return { words, chars };
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
