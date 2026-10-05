"use client";

import React, { useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";

type DocumentSummary = {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  relationship: "owned" | "shared";
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DashboardClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const [owned, setOwned] = React.useState<DocumentSummary[]>([]);
  const [shared, setShared] = React.useState<DocumentSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [docToDelete, setDocToDelete] = React.useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch("/api/documents");
        if (!res.ok) {
          if (res.status === 401) { router.push("/login"); return; }
          throw new Error(`Failed to load documents (${res.status})`);
        }
        const data = await res.json();
        if (!ignore) {
          setOwned(data.owned ?? []);
          setShared(data.shared ?? []);
        }
      } catch (e) {
        if (!ignore) {
          setError(e instanceof Error ? e.message : "Failed to load documents");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [router]);

  const handleNewDocument = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled document" }),
      });
      if (!res.ok) throw new Error("Failed to create document");
      const { id } = await res.json();
      router.push(`/documents/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create document");
      setCreating(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Only .txt files are supported. Please select a UTF-8 text file.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("File too large. Maximum size is 1 MiB.");
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/import", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Import failed (${res.status})`);
      }
      const { id } = await res.json();
      router.push(`/documents/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${docToDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to delete document");
      }
      setOwned((prev) => prev.filter((d) => d.id !== docToDelete.id));
      setDocToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete document");
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900">Ajaia Docs</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-500 sm:block">
              {session?.user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Action bar */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
          <div className="flex gap-2">
            <button
              onClick={() => importRef.current?.click()}
              disabled={importing}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              title="Upload a UTF-8 .txt file (max 1 MiB)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {importing ? "Importing…" : "Import .txt"}
            </button>
            <input ref={importRef} type="file" accept=".txt" className="hidden" onChange={handleImport} />

            <button
              onClick={handleNewDocument}
              disabled={creating}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {creating ? "Creating…" : "New document"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="cursor-pointer font-medium underline">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-500">
            Loading documents…
          </div>
        ) : (
          <>
            {/* My Documents */}
            <section className="mb-10">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                My documents ({owned.length})
              </h2>
              {owned.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
                  <p className="text-sm text-gray-500">No documents yet.</p>
                  <button
                    onClick={handleNewDocument}
                    className="mt-3 cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Create your first document →
                  </button>
                </div>
              ) : (
                <DocumentGrid docs={owned} relationship="owned" onDelete={setDocToDelete} />
              )}
            </section>

            {/* Shared with me */}
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Shared with me ({shared.length})
              </h2>
              {shared.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
                  <p className="text-sm text-gray-500">No documents have been shared with you.</p>
                </div>
              ) : (
                <DocumentGrid docs={shared} relationship="shared" />
              )}
            </section>
          </>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Delete document</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="mb-5 text-sm text-gray-600">
              Are you sure you want to delete <span className="font-semibold text-gray-900">&ldquo;{docToDelete.title}&rdquo;</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDocToDelete(null)}
                className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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

function DocumentGrid({
  docs,
  relationship,
  onDelete,
}: {
  docs: DocumentSummary[];
  relationship: "owned" | "shared";
  onDelete?: (doc: DocumentSummary) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md cursor-pointer"
        >
          <Link
            href={`/documents/${doc.id}`}
            className="absolute inset-0 z-0 cursor-pointer"
            aria-label={`Open ${doc.title}`}
          />
          <div className="mb-3 flex items-start justify-between gap-2 relative z-10">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 group-hover:bg-blue-50 transition-colors">
              <svg className="h-5 w-5 text-gray-500 group-hover:text-blue-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  relationship === "owned"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-purple-100 text-purple-700"
                }`}
              >
                {relationship === "owned" ? "Owner" : "Shared"}
              </span>
              {relationship === "owned" && onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(doc);
                  }}
                  title="Delete document"
                  className="cursor-pointer rounded p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all focus:opacity-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <h3 className="mb-1 line-clamp-2 text-sm font-medium text-gray-900 relative z-10 pointer-events-none">
            {doc.title}
          </h3>
          <div className="mt-auto pt-3 text-xs text-gray-400 relative z-10 pointer-events-none">
            {relationship === "shared" && (
              <span className="block mb-0.5">by {doc.ownerName}</span>
            )}
            <span>{formatDate(doc.updatedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
