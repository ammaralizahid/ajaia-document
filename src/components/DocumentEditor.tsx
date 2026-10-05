"use client";

/**
 * DocumentEditor — Tiptap-based rich-text editor for shared documents.
 *
 * Implements document formatting, headings, font styling, color palettes,
 * alignment, links, and history management with Next.js SSR compatibility.
 * Consumes and emits authoritative Tiptap JSON trees (stored in PostgreSQL JSONB).
 */

import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import { FontSize } from "@/lib/tiptap-font-size";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  Unlink,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  Eraser,
} from "lucide-react";

// ─── Font & Styling Configuration ───────────────────────────────────────────

const FONT_SIZE_OPTIONS = [
  { label: "Size", value: "" },
  { label: "12px", value: "12px" },
  { label: "13px", value: "13px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
  { label: "36px", value: "36px" },
] as const;

const FONT_FAMILY_OPTIONS: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Inter", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "DM Sans", value: "'DM Sans', ui-sans-serif, sans-serif" },
  { label: "Plus Jakarta Sans", value: "'Plus Jakarta Sans', ui-sans-serif, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', Helvetica, Arial, sans-serif" },
  { label: "Lato", value: "Lato, 'Helvetica Neue', Arial, sans-serif" },
  { label: "Poppins", value: "Poppins, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', ui-monospace, monospace" },
];

// A handful of Google fonts actually used in this reduced list
const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400",
    "family=Plus+Jakarta+Sans:wght@400;500;600;700",
    "family=Open+Sans:ital,wght@0,400;0,600",
    "family=Lato:ital,wght@0,400;0,700",
    "family=Poppins:ital,wght@0,400;0,600",
    "family=Merriweather:ital,wght@0,400;0,700",
    "family=JetBrains+Mono:wght@400;600",
  ].join("&") +
  "&display=swap";

const TEXT_COLORS = ["#111827", "#1d4ed8", "#047857", "#b91c1c", "#7c3aed", "#ea580c"] as const;
const HIGHLIGHT_COLORS = ["#FEF3C7", "#DCFCE7", "#DBEAFE", "#FCE7F3", "#E9D5FF", "#FEE2E2"] as const;

// ─── Toolbar primitives ───────────────────────────────────────────────────────

type ToolbarButtonProps = {
  active?: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function ToolbarButton({ active = false, title, onClick, disabled = false, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
        active
          ? "bg-blue-100 text-blue-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-gray-200" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export type DocumentEditorProps = {
  /** Tiptap JSON document object. Loaded once per document; do not change on save. */
  initialContent: Record<string, unknown>;
  onContentChange: (json: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
};

export default function DocumentEditor({
  initialContent,
  onContentChange,
  editable = true,
  placeholder = "Start writing…",
}: DocumentEditorProps) {
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
  const [linkUrlDraft, setLinkUrlDraft] = React.useState("https://");
  const [linkError, setLinkError] = React.useState("");
  const linkRangeRef = React.useRef<{ from: number; to: number } | null>(null);

  // Load Google Fonts once
  React.useEffect(() => {
    const id = "ajaia-doc-editor-fonts";
    if (typeof document === "undefined" || document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent as object,
    editable,
    immediatelyRender: false, // Next.js SSR compatibility
    onUpdate: ({ editor: ed }: { editor: Editor }) => {
      onContentChange(ed.getJSON() as Record<string, unknown>);
    },
    editorProps: {
      attributes: {
        class: [
          "min-h-[60vh] p-8 text-base leading-7 focus:outline-none",
          "prose prose-slate max-w-none",
          "prose-headings:font-semibold prose-headings:text-gray-900",
          "prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-h4:text-lg",
          "prose-p:text-gray-800 prose-p:my-2",
          "prose-ul:my-2 prose-ol:my-2 prose-li:my-1",
          "prose-blockquote:border-l-4 prose-blockquote:border-blue-300 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600",
          "prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono",
          "prose-a:text-blue-600 prose-a:underline hover:prose-a:text-blue-800",
        ].join(" "),
      },
    },
  });

  // Keep tiptap editable state in sync with editable prop
  React.useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // ── Toolbar handlers ────────────────────────────────────────────────────────

  const setHeading = (level: string) => {
    if (!editor) return;
    if (level === "p") { editor.chain().focus().setParagraph().run(); return; }
    const parsed = Number(level);
    if (![1, 2, 3, 4].includes(parsed)) return;
    editor.chain().focus().toggleHeading({ level: parsed as 1 | 2 | 3 | 4 }).run();
  };

  const setFontFamily = (ff: string) => {
    if (!editor) return;
    if (!ff) { editor.chain().focus().unsetFontFamily().run(); return; }
    editor.chain().focus().setFontFamily(ff).run();
  };

  const setFontSize = (size: string) => {
    if (!editor) return;
    if (!size) { editor.chain().focus().unsetFontSize().run(); return; }
    editor.chain().focus().setFontSize(size).run();
  };

  const openLinkDialog = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    linkRangeRef.current = { from, to };
    const prev = editor.getAttributes("link").href;
    setLinkUrlDraft(String(prev || "https://"));
    setLinkError("");
    setLinkDialogOpen(true);
  };

  const applyLink = () => {
    if (!editor) return;
    const raw = linkUrlDraft.trim();
    const range = linkRangeRef.current;
    const from = range?.from ?? editor.state.selection.from;
    const to = range?.to ?? editor.state.selection.to;
    const hadLink = editor.isActive("link");

    if (!raw) {
      editor.chain().focus().setTextSelection({ from, to }).extendMarkRange("link").unsetLink().run();
      setLinkDialogOpen(false); linkRangeRef.current = null;
      return;
    }

    const normalized = /^(https?:|mailto:|tel:|#)/i.test(raw) ? raw : `https://${raw}`;

    if (from === to && hadLink) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    } else if (from !== to) {
      editor.chain().focus().setTextSelection({ from, to }).setLink({ href: normalized }).run();
    } else {
      setLinkError("Select text first, or click inside an existing link to edit it.");
      return;
    }
    setLinkDialogOpen(false); linkRangeRef.current = null;
  };

  if (!editor) {
    return <div className="h-64 animate-pulse rounded-lg bg-gray-100" />;
  }

  const currentFontSize = String(editor.getAttributes("textStyle").fontSize || "").trim();
  const headingLevel = [1, 2, 3, 4].find((l) => editor.isActive("heading", { level: l }));
  const headingValue = headingLevel ? String(headingLevel) : "p";

  return (
    <div className="print-document-container flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Toolbar */}
      {editable && (
        <div className="no-print flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 p-2">
          {/* Heading select */}
          <select
            className="cursor-pointer h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
            value={headingValue}
            onChange={(e) => setHeading(e.target.value)}
          >
            <option value="p">Paragraph</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
            <option value="4">Heading 4</option>
          </select>

          {/* Font family */}
          <select
            className="cursor-pointer h-8 min-w-[8rem] max-w-[11rem] rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
            title="Font family"
            value={String(editor.getAttributes("textStyle").fontFamily || "")}
            onChange={(e) => setFontFamily(e.target.value)}
          >
            {FONT_FAMILY_OPTIONS.map((f) => (
              <option key={f.label} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Font size */}
          <select
            className="cursor-pointer h-8 w-20 rounded-md border border-gray-200 bg-white px-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
            title="Font size"
            value={currentFontSize}
            onChange={(e) => setFontSize(e.target.value)}
          >
            {FONT_SIZE_OPTIONS.map((s) => (
              <option key={s.label + s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <ToolbarDivider />

          {/* Basic marks */}
          <ToolbarButton active={editor.isActive("bold")} title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("italic")} title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("underline")} title="Underline (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("strike")} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Text colors */}
          <div className="flex items-center gap-0.5 px-1">
            <span className="mr-1 text-[10px] text-gray-400">A</span>
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={`Text color ${color}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setColor(color).run()}
                className="cursor-pointer h-5 w-5 rounded-full border border-white shadow-sm hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
              />
            ))}
            <input
              type="color"
              title="Custom text color"
              className="h-6 w-6 cursor-pointer rounded border p-0"
              value={String(editor.getAttributes("textStyle").color || "#111827")}
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
          </div>

          {/* Highlights */}
          <div className="flex items-center gap-0.5 px-1">
            <span className="mr-1 text-[10px] text-gray-400">H</span>
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={`Highlight ${color}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setHighlight({ color }).run()}
                className="cursor-pointer h-5 w-5 rounded border border-black/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
              />
            ))}
            <button
              type="button"
              title="Remove highlight"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().unsetHighlight().run()}
              className="cursor-pointer h-6 rounded px-1.5 text-[10px] text-gray-500 hover:bg-gray-100"
            >
              None
            </button>
          </div>

          <ToolbarDivider />

          {/* Lists */}
          <ToolbarButton active={editor.isActive("bulletList")} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("orderedList")} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("blockquote")} title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Alignment */}
          <ToolbarButton active={editor.isActive({ textAlign: "left" })} title="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: "center" })} title="Align center" onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive({ textAlign: "right" })} title="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Link */}
          <ToolbarButton active={editor.isActive("link")} title="Insert / edit link" onClick={openLinkDialog}>
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          {editor.isActive("link") && (
            <ToolbarButton title="Remove link" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
              <Unlink className="h-4 w-4" />
            </ToolbarButton>
          )}

          <ToolbarDivider />

          {/* Undo / Redo / Clear */}
          <ToolbarButton title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Redo (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
            <Eraser className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      {/* Editor canvas */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>

      {/* Link dialog */}
      {linkDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Insert link</h3>
            {linkError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{linkError}</p>
            )}
            <input
              type="url"
              value={linkUrlDraft}
              autoFocus
              onChange={(e) => setLinkUrlDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") setLinkDialogOpen(false); }}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="https://"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setLinkDialogOpen(false); linkRangeRef.current = null; }}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={applyLink}
                className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
