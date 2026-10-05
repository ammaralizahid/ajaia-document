"use client";

/**
 * DocumentEditorPage — the main editing surface.
 *
 * Save behavior:
 *  - Explicit Save button and Ctrl/Cmd+S
 *  - Serialized debounced autosave (3s after last keystroke)
 *  - Revision-based compare-and-swap (HTTP 409 on conflict)
 *  - Edit generations tracked to prevent stale responses marking newer edits saved
 *  - Dirty state warning on navigation
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";
import DocumentEditor from "@/components/DocumentEditor";
import { emptyDocument } from "@/lib/content-validation";
import { tiptapToMarkdown, tiptapToPlainText, getDocumentStats, downloadFile } from "@/lib/export";

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "failed" | "conflict";

type DocumentData = {
  id: string;
  title: string;
  contentJson: Record<string, unknown>;
  revision: number;
  isOwner: boolean;
  ownerId: string;
  updatedAt: string;
  role?: "owner" | "editor" | "viewer";
  canEdit?: boolean;
};

type ShareEntry = {
  userId: string;
  userName: string;
  userEmail: string;
  role?: "editor" | "viewer";
};

export function EditorClient({ documentId }: { documentId: string }) {
  const router = useRouter();
  useSession();

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Title state
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictDraft, setConflictDraft] = useState<Record<string, unknown> | null>(null);

  // Revision tracking
  const revisionRef = useRef(0);
  const localEditGenRef = useRef(0); // incremented on every content change
  const savedGenRef = useRef(0);     // gen that was last saved successfully
  const pendingGenRef = useRef<number | null>(null); // gen currently being saved
  const latestContentRef = useRef<Record<string, unknown>>(emptyDocument());

  // Debounce timer
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false); // prevent concurrent saves

  // Sharing dialog
  const [shareOpen, setShareOpen] = useState(false);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("editor");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Export menu & stats
  const [exportOpen, setExportOpen] = useState(false);
  const [stats, setStats] = useState({ words: 0, chars: 0 });

  // ── Load document ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/documents/${documentId}`);
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 404) { setLoadError("Document not found or you don't have access."); setLoading(false); return; }
        if (!res.ok) throw new Error(`Failed to load document (${res.status})`);
        const data: DocumentData = await res.json();
        setDoc(data);
        setTitle(data.title);
        latestContentRef.current = data.contentJson ?? emptyDocument();
        revisionRef.current = data.revision;
        setStats(getDocumentStats(data.contentJson));
        setSaveStatus("idle");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load document");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [documentId, router]);

  // ── Save logic ─────────────────────────────────────────────────────────────

  const performSave = useCallback(async (gen: number): Promise<boolean> => {
    if (doc?.canEdit === false) return false;
    if (savingRef.current) return false;
    if (gen <= savedGenRef.current) return true; // already saved

    savingRef.current = true;
    pendingGenRef.current = gen;
    setSaveStatus("saving");
    setSaveError(null);

    const contentToSave = latestContentRef.current;
    const expectedRevision = revisionRef.current;

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentJson: contentToSave, revision: expectedRevision }),
      });

      // If user edited more during the save, gen < localEditGenRef.current
      const genAtResponse = pendingGenRef.current ?? gen;

      if (res.ok) {
        const data = await res.json();
        revisionRef.current = data.revision;

        // Only mark saved if response covers the generation we just saved.
        // If user typed more, we still show "unsaved" for the newer edits.
        if (genAtResponse >= localEditGenRef.current) {
          savedGenRef.current = genAtResponse;
          setSaveStatus("saved");
        } else {
          // There are newer unsaved edits — don't mark saved
          setSaveStatus("unsaved");
        }
        return true;
      } else if (res.status === 409) {
        // Conflict: another session saved. Preserve draft.
        setConflictDraft(contentToSave);
        setSaveStatus("conflict");
        setSaveError("Another session modified this document. Copy your draft, then reload to resolve.");
        return false;
      } else {
        const body = await res.json().catch(() => ({}));
        setSaveStatus("failed");
        setSaveError(body.error ?? `Save failed (${res.status})`);
        return false;
      }
    } catch {
      setSaveStatus("failed");
      setSaveError("Network error. Your changes are preserved — click Retry to save.");
      return false;
    } finally {
      savingRef.current = false;
      pendingGenRef.current = null;
    }
  }, [documentId, doc?.canEdit]);

  const scheduleSave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      const gen = localEditGenRef.current;
      await performSave(gen);
    }, 3000);
  }, [performSave]);

  const handleContentChange = useCallback((json: Record<string, unknown>) => {
    latestContentRef.current = json;
    localEditGenRef.current += 1;
    setStats(getDocumentStats(json));
    if (doc?.canEdit !== false) {
      setSaveStatus("unsaved");
      setSaveError(null);
      scheduleSave();
    }
  }, [doc?.canEdit, scheduleSave]);

  const handleExplicitSave = useCallback(async () => {
    if (doc?.canEdit === false) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    await performSave(localEditGenRef.current);
  }, [doc?.canEdit, performSave]);

  // ── Export handlers ────────────────────────────────────────────────────────

  const handleExportMarkdown = () => {
    const md = tiptapToMarkdown(latestContentRef.current);
    const safeTitle = (title.trim() || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    downloadFile(`${safeTitle}.md`, md, "text/markdown;charset=utf-8");
    setExportOpen(false);
  };

  const handleExportPlainText = () => {
    const txt = tiptapToPlainText(latestContentRef.current);
    const safeTitle = (title.trim() || "untitled").replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    downloadFile(`${safeTitle}.txt`, txt, "text/plain;charset=utf-8");
    setExportOpen(false);
  };

  const handlePrintPdf = () => {
    setExportOpen(false);
    window.print();
  };

  // Keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleExplicitSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleExplicitSave]);

  // Dirty state warning on unload
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved" || saveStatus === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveStatus]);

  // ── Title rename ────────────────────────────────────────────────────────────

  const submitTitleRename = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title) { setEditingTitle(false); return; }
    if (trimmed.length > 120) { return; }
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setTitle(trimmed);
        setEditingTitle(false);
      }
    } catch { /* ignore title save errors */ }
  };

  // ── Sharing ─────────────────────────────────────────────────────────────────

  const openShareDialog = async () => {
    setShareOpen(true);
    setShareError(null);
    setShareSuccess(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/shares`);
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares ?? []);
      }
    } catch { /* ignore */ }
  };

  const handleShare = async () => {
    if (!shareEmail.trim()) return;
    setShareLoading(true);
    setShareError(null);
    setShareSuccess(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmail.trim(), role: shareRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareSuccess(
          `Shared with ${data.recipient.name} as ${data.recipient.role === "viewer" ? "viewer" : "editor"}`
        );
        setShareEmail("");
        // Refresh share list
        const r2 = await fetch(`/api/documents/${documentId}/shares`);
        if (r2.ok) setShares((await r2.json()).shares ?? []);
      } else {
        setShareError(data.error ?? "Failed to share");
      }
    } catch {
      setShareError("Network error. Please try again.");
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevokeShare = async (targetUserId: string) => {
    if (!doc?.isOwner) return;
    setRevokingId(targetUserId);
    setShareError(null);
    setShareSuccess(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/shares?userId=${encodeURIComponent(targetUserId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShares((prev) => prev.filter((s) => s.userId !== targetUserId));
        setShareSuccess("Access revoked.");
      } else {
        const data = await res.json().catch(() => ({}));
        setShareError(data.error ?? "Failed to revoke access");
      }
    } catch {
      setShareError("Network error revoking access.");
    } finally {
      setRevokingId(null);
    }
  };

  // ── Conflict recovery ────────────────────────────────────────────────────────

  const handleReloadAfterConflict = async () => {
    // Preserve draft in clipboard encouragement message (we can't force copy)
    const res = await fetch(`/api/documents/${documentId}`);
    if (res.ok) {
      const fresh: DocumentData = await res.json();
      setDoc(fresh);
      setTitle(fresh.title);
      latestContentRef.current = fresh.contentJson ?? emptyDocument();
      revisionRef.current = fresh.revision;
      localEditGenRef.current = 0;
      savedGenRef.current = 0;
      setSaveStatus("idle");
      setSaveError(null);
      setConflictDraft(null);
    }
  };

  // ── Document deletion ──────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!doc?.isOwner) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.error ?? `Failed to delete document (${res.status})`);
        setDeleting(false);
      }
    } catch {
      setDeleteError("Network error while deleting document. Please try again.");
      setDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        Loading document…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  if (!doc) return null;

  const saveStatusLabel: Record<SaveStatus, string> = {
    idle: "",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    saved: "Saved",
    failed: "Save failed",
    conflict: "Conflict",
  };

  const saveStatusColor: Record<SaveStatus, string> = {
    idle: "text-gray-400",
    unsaved: "text-amber-600",
    saving: "text-blue-500",
    saved: "text-green-600",
    failed: "text-red-500",
    conflict: "text-red-600 font-semibold",
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          {/* Back */}
          <Link href="/dashboard" className="cursor-pointer shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          {/* Document logo */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          {/* Title */}
          <div className="min-w-0 flex-1">
            {editingTitle && doc.isOwner ? (
              <input
                autoFocus
                value={titleDraft}
                maxLength={120}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={submitTitleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitTitleRename();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="w-full rounded border border-blue-400 px-2 py-0.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : (
              <button
                className={[
                  "block max-w-full truncate text-left text-sm font-medium text-gray-900",
                  doc.isOwner ? "hover:text-blue-600 cursor-text" : "cursor-default",
                ].join(" ")}
                onClick={() => {
                  if (!doc.isOwner) return;
                  setTitleDraft(title);
                  setEditingTitle(true);
                }}
                title={doc.isOwner ? "Click to rename" : title}
              >
                {title}
              </button>
            )}
            <div className="flex items-center gap-2">
              {doc.canEdit === false ? (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  View only
                </span>
              ) : (
                <span className={`text-xs ${saveStatusColor[saveStatus]}`}>
                  {saveStatusLabel[saveStatus]}
                </span>
              )}
              {!doc.isOwner && (
                <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                  {doc.role === "viewer" ? "Shared (Viewer)" : "Shared (Editor)"}
                </span>
              )}
              <span className="text-[11px] text-gray-400 font-mono hidden sm:inline">
                {stats.words} {stats.words === 1 ? "word" : "words"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {saveStatus === "failed" && (
              <button
                onClick={handleExplicitSave}
                className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Retry
              </button>
            )}
            {saveStatus === "conflict" && (
              <button
                onClick={handleReloadAfterConflict}
                className="cursor-pointer rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100"
              >
                Reload
              </button>
            )}
            {doc.canEdit !== false && (
              <button
                onClick={handleExplicitSave}
                disabled={saveStatus === "saving" || saveStatus === "saved" || saveStatus === "idle"}
                className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            )}
            {/* Export dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen(!exportOpen)}
                title="Export document"
                className="cursor-pointer rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1"
              >
                <span>Export</span>
                <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-40">
                    <button
                      type="button"
                      onClick={handleExportMarkdown}
                      className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
                    >
                      <span>📄</span>
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintPdf}
                      className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
                    >
                      <span>🖨️</span>
                      <span>PDF (Print preview)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPlainText}
                      className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left transition-colors"
                    >
                      <span>📝</span>
                      <span>Plain Text (.txt)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            {doc.isOwner && (
              <>
                <button
                  onClick={openShareDialog}
                  className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteOpen(true); setDeleteError(null); }}
                  title="Delete document"
                  className="cursor-pointer rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                  aria-label="Delete document"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
            <button
              onClick={async () => { await signOut(); router.push("/login"); }}
              className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Error/conflict banners */}
        {saveError && (
          <div className={`border-t px-4 py-2 text-xs ${saveStatus === "conflict" ? "border-orange-200 bg-orange-50 text-orange-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {saveError}
            {conflictDraft && (
              <button
                onClick={() => {
                  const text = JSON.stringify(conflictDraft, null, 2);
                  navigator.clipboard.writeText(text).catch(() => {});
                }}
                className="ml-2 underline cursor-pointer"
              >
                Copy draft JSON
              </button>
            )}
          </div>
        )}
      </header>

      {/* Editor canvas */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {doc && (
          <DocumentEditor
            key={doc.id}
            initialContent={doc.contentJson ?? emptyDocument()}
            onContentChange={handleContentChange}
            editable={doc.canEdit !== false}
            placeholder={doc.canEdit === false ? "Document is view-only." : "Start writing…"}
          />
        )}
      </main>

      {/* Share dialog */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Share &ldquo;{title}&rdquo;</h3>
              <button onClick={() => setShareOpen(false)} className="cursor-pointer rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-4 text-xs text-gray-500">
              Enter the email of a seeded demo user. Only existing accounts can be added.
            </p>

            {shareError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{shareError}</p>}
            {shareSuccess && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{shareSuccess}</p>}

            <div className="flex gap-2 mb-5">
              <input
                type="email"
                placeholder="bob@ajaia.demo"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleShare()}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value as "editor" | "viewer")}
                className="cursor-pointer rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                onClick={handleShare}
                disabled={shareLoading || !shareEmail.trim()}
                className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {shareLoading ? "Adding…" : "Add"}
              </button>
            </div>

            {shares.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Shared with</p>
                <div className="space-y-2">
                  {shares.map((s) => (
                    <div key={s.userId} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700">
                        {s.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{s.userName}</p>
                        <p className="text-[11px] text-gray-400 truncate">{s.userEmail}</p>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        s.role === "viewer"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-purple-100 text-purple-800"
                      }`}>
                        {s.role === "viewer" ? "Can view" : "Can edit"}
                      </span>
                      {doc.isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRevokeShare(s.userId)}
                          disabled={revokingId === s.userId}
                          title="Revoke access"
                          className="cursor-pointer rounded px-1.5 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                        >
                          {revokingId === s.userId ? "…" : "Remove"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-[11px] text-gray-400">
              Owners can grant editing or view-only access, or revoke access at any time.
            </p>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete document?</h3>
            <p className="text-xs text-gray-600 mb-4">
              Are you sure you want to delete <span className="font-semibold text-gray-900">&ldquo;{title}&rdquo;</span>? This action cannot be undone.
            </p>
            {deleteError && (
              <p className="mb-3 text-xs text-red-600 bg-red-50 p-2 rounded">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setDeleteOpen(false); setDeleteError(null); }}
                disabled={deleting}
                className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
