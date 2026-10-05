/**
 * Unit tests for content validation logic (no database required).
 */

import { describe, it, expect } from "vitest";
import {
  validateTiptapContent,
  validateTitle,
  textToTiptapDocument,
  emptyDocument,
} from "../src/lib/content-validation";

describe("validateTitle", () => {
  it("accepts valid title", () => {
    expect(validateTitle("My Document")).toBe("My Document");
  });

  it("trims whitespace", () => {
    expect(validateTitle("  Hello  ")).toBe("Hello");
  });

  it("rejects empty string", () => {
    expect(() => validateTitle("")).toThrow();
    expect(() => validateTitle("   ")).toThrow();
  });

  it("rejects title over 120 chars", () => {
    expect(() => validateTitle("A".repeat(121))).toThrow();
  });

  it("rejects non-string", () => {
    expect(() => validateTitle(123 as unknown as string)).toThrow();
  });
});

describe("validateTiptapContent", () => {
  it("accepts valid empty document", () => {
    const doc = emptyDocument();
    expect(() => validateTiptapContent(doc)).not.toThrow();
  });

  it("accepts bold + italic text", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "text", text: "Italic", marks: [{ type: "italic" }] },
          ],
        },
      ],
    };
    expect(() => validateTiptapContent(content)).not.toThrow();
  });

  it("rejects unknown node types", () => {
    const content = {
      type: "doc",
      content: [{ type: "table" }],
    };
    expect(() => validateTiptapContent(content)).toThrow(/Unsupported node type/);
  });

  it("rejects unknown mark types", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hi", marks: [{ type: "super" }] }],
        },
      ],
    };
    expect(() => validateTiptapContent(content)).toThrow(/Unsupported mark/);
  });

  it("rejects invalid link href (javascript:)", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    expect(() => validateTiptapContent(content)).toThrow(/Invalid link/);
  });

  it("accepts https link", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    expect(() => validateTiptapContent(content)).not.toThrow();
  });

  it("rejects content exceeding 2MiB", () => {
    // Create a large document
    const hugeContent = {
      type: "doc",
      content: Array.from({ length: 10000 }, () => ({
        type: "paragraph",
        content: [{ type: "text", text: "A".repeat(250) }],
      })),
    };
    expect(() => validateTiptapContent(hugeContent)).toThrow(/too many nodes|2 MiB/);
  });

  it("rejects non-doc root", () => {
    expect(() => validateTiptapContent({ type: "paragraph" })).toThrow();
  });

  it("rejects null", () => {
    expect(() => validateTiptapContent(null)).toThrow();
  });

  it("rejects array", () => {
    expect(() => validateTiptapContent([])).toThrow();
  });
});

describe("textToTiptapDocument", () => {
  it("converts single line to paragraph", () => {
    const doc = textToTiptapDocument("Hello world");
    expect(doc.type).toBe("doc");
    const content = doc.content as { type: string; content?: { type: string; text?: string }[] }[];
    expect(content[0].type).toBe("paragraph");
    expect(content[0].content?.[0].text).toBe("Hello world");
  });

  it("converts blank-line-separated text to multiple paragraphs", () => {
    const doc = textToTiptapDocument("Para 1\n\nPara 2");
    const content = doc.content as { type: string }[];
    expect(content.length).toBe(2);
  });

  it("preserves literal HTML as text (not node types)", () => {
    const doc = textToTiptapDocument("<script>alert(1)</script>");
    const serialized = JSON.stringify(doc);
    expect(serialized).toContain("alert");
    expect(serialized).not.toContain('"type":"script"');
  });

  it("returns valid doc even for empty string", () => {
    const doc = textToTiptapDocument("");
    expect(doc.type).toBe("doc");
    expect(() => validateTiptapContent(doc)).not.toThrow();
  });
});
