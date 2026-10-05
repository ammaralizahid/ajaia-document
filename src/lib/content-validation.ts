/**
 * Content validation for Tiptap JSON documents.
 *
 * Validates that stored or incoming JSON is a well-formed Tiptap document
 * (schema version 1). Rejects arbitrary JSON, unknown node/mark types, and
 * disallowed attributes. Text containing HTML remains literal; we never
 * render stored text via dangerouslySetInnerHTML.
 */

// ─── Allowed node/mark types ──────────────────────────────────────────────────

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "code",
  "hardBreak",
  "horizontalRule",
]);

const ALLOWED_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textStyle",
  "highlight",
]);

// ─── Allowed attributes per node/mark ────────────────────────────────────────

function isAllowedTextStyle(attrs: Record<string, unknown>): boolean {
  const ALLOWED_FONT_SIZES = [
    "12px","13px","14px","16px","18px","20px","24px","28px","32px","36px",
  ];
  const ALLOWED_COLORS = /^(#[0-9a-fA-F]{3,8}|rgb\(\d+,\s*\d+,\s*\d+\))$/;
  const ALLOWED_FONT_FAMILIES = new Set([
    "", "Inter, ui-sans-serif, system-ui, sans-serif",
    "'DM Sans', ui-sans-serif, sans-serif",
    "'Plus Jakarta Sans', ui-sans-serif, sans-serif",
    "Outfit, ui-sans-serif, sans-serif",
    "Manrope, ui-sans-serif, sans-serif",
    "Lexend, ui-sans-serif, sans-serif",
    "Sora, ui-sans-serif, sans-serif",
    "'Source Sans 3', 'Open Sans', sans-serif",
    "'Open Sans', Helvetica, Arial, sans-serif",
    "Lato, 'Helvetica Neue', Arial, sans-serif",
    "Nunito, Segoe UI, sans-serif",
    "Poppins, Arial, sans-serif",
    "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    "Arial, Helvetica, sans-serif",
    "Verdana, Geneva, sans-serif",
    "'Trebuchet MS', sans-serif",
    "Georgia, 'Times New Roman', serif",
    "Merriweather, Georgia, serif",
    "'Playfair Display', Georgia, serif",
    "Fraunces, Georgia, serif",
    "'Crimson Pro', Georgia, serif",
    "'Times New Roman', Times, serif",
    "'JetBrains Mono', ui-monospace, monospace",
    "'Courier New', Courier, monospace",
  ]);

  for (const [k, v] of Object.entries(attrs)) {
    if (k === "fontSize") {
      if (v !== null && !ALLOWED_FONT_SIZES.includes(String(v))) return false;
    } else if (k === "color") {
      if (v !== null && !ALLOWED_COLORS.test(String(v))) return false;
    } else if (k === "fontFamily") {
      if (v !== null && !ALLOWED_FONT_FAMILIES.has(String(v))) return false;
    } else {
      // Unknown textStyle attribute
      return false;
    }
  }
  return true;
}

function isAllowedLinkAttrs(attrs: Record<string, unknown>): boolean {
  const href = String(attrs.href ?? "");
  if (!/^(https?:|mailto:|tel:|#)/i.test(href)) return false;
  const extra = Object.keys(attrs).filter((k) => !["href", "target", "rel", "class"].includes(k));
  return extra.length === 0;
}

function isAllowedHighlightAttrs(attrs: Record<string, unknown>): boolean {
  const COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\(\d+,\s*\d+,\s*\d+\))$/;
  return Object.entries(attrs).every(([k, v]) => {
    if (k === "color") return v === null || COLOR.test(String(v));
    return false;
  });
}

function validateNode(node: unknown, depth: number): void {
  if (depth > 20) throw new Error("Document nesting too deep");
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    throw new Error("Invalid node shape");
  }

  const n = node as Record<string, unknown>;
  const type = n.type;
  if (typeof type !== "string") throw new Error("Node missing type");

  if (type !== "doc" && !ALLOWED_NODES.has(type)) {
    throw new Error(`Unsupported node type: ${type}`);
  }

  // Validate attrs
  if (n.attrs !== undefined) {
    if (typeof n.attrs !== "object" || n.attrs === null) {
      throw new Error(`Invalid attrs on ${type}`);
    }
    if (type === "heading") {
      const level = (n.attrs as Record<string, unknown>).level;
      if (![1, 2, 3, 4].includes(Number(level))) {
        throw new Error("Invalid heading level");
      }
    }
  }

  // Validate marks
  if (n.marks !== undefined) {
    if (!Array.isArray(n.marks)) throw new Error("marks must be array");
    for (const mark of n.marks) {
      if (typeof mark !== "object" || mark === null) throw new Error("Invalid mark");
      const m = mark as Record<string, unknown>;
      if (!ALLOWED_MARKS.has(String(m.type))) {
        throw new Error(`Unsupported mark: ${m.type}`);
      }
      if (m.attrs !== undefined && typeof m.attrs === "object" && m.attrs !== null) {
        const attrs = m.attrs as Record<string, unknown>;
        if (m.type === "textStyle" && !isAllowedTextStyle(attrs)) {
          throw new Error("Invalid textStyle attributes");
        }
        if (m.type === "link" && !isAllowedLinkAttrs(attrs)) {
          throw new Error("Invalid link href");
        }
        if (m.type === "highlight" && !isAllowedHighlightAttrs(attrs)) {
          throw new Error("Invalid highlight color");
        }
      }
    }
  }

  // Recurse into content
  if (n.content !== undefined) {
    if (!Array.isArray(n.content)) throw new Error("content must be array");
    if (n.content.length > 5000) throw new Error("Document has too many nodes");
    for (const child of n.content) {
      validateNode(child, depth + 1);
    }
  }
}

/** Schema version we currently support */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Validate a Tiptap JSON document.
 * Throws with a descriptive message on failure.
 * Returns the validated content as-is (typed as unknown for storage).
 */
export function validateTiptapContent(content: unknown): Record<string, unknown> {
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    throw new Error("Content must be a JSON object");
  }
  const c = content as Record<string, unknown>;
  if (c.type !== "doc") throw new Error("Root node must be 'doc'");
  validateNode(c, 0);

  // Rough size check: serialize and check byte length
  const serialized = JSON.stringify(c);
  if (serialized.length > 2 * 1024 * 1024) {
    throw new Error("Document content exceeds 2 MiB limit");
  }
  return c;
}

/** Validate and trim a document title. */
export function validateTitle(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Title must be a string");
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("Title cannot be empty");
  if (trimmed.length > 120) throw new Error("Title cannot exceed 120 characters");
  return trimmed;
}

/** Empty document content (Tiptap doc with one empty paragraph). */
export function emptyDocument(): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/**
 * Convert plain text (from a .txt file import) into a Tiptap doc.
 * Each paragraph-separated block becomes a paragraph node.
 * Text is treated literally; no HTML is parsed.
 */
export function textToTiptapDocument(text: string): Record<string, unknown> {
  // Split on blank lines for paragraphs; single newlines become hardBreaks
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/);

  const content = paragraphs.map((para) => {
    const lines = para.split("\n");
    const nodeContent: unknown[] = [];
    lines.forEach((line, i) => {
      if (line.length > 0) {
        nodeContent.push({ type: "text", text: line });
      }
      if (i < lines.length - 1) {
        nodeContent.push({ type: "hardBreak" });
      }
    });
    if (nodeContent.length === 0) {
      return { type: "paragraph" };
    }
    return { type: "paragraph", content: nodeContent };
  });

  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}
