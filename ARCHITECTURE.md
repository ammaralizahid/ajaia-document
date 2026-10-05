# System Architecture & Technical Design

This document details the architectural decisions, data model, request lifecycles, and code extraction strategy implemented in the Ajaia Document Editor.

---

## 1. High-Level Architecture & Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│                                                             │
│  ┌────────────────┐   ┌─────────────────┐   ┌────────────┐  │
│  │   Auth Pages   │   │    Dashboard    │   │   Editor   │  │
│  │  (/login)      │   │  (/dashboard)   │   │  (/doc/id) │  │
│  └───────┬────────┘   └────────┬────────┘   └──────┬─────┘  │
└──────────┼─────────────────────┼───────────────────┼────────┘
           │                     │                   │
           ▼                     ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                 Next.js App Router (Node.js)                │
│                                                             │
│  ┌────────────────┐   ┌─────────────────┐   ┌────────────┐  │
│  │  Better Auth   │   │  Access Preds   │   │ Validation │  │
│  │  /api/auth/*   │   │  (requireUser)  │   │ Whitelist  │  │
│  └───────┬────────┘   └────────┬────────┘   └──────┬─────┘  │
└──────────┼─────────────────────┼───────────────────┼────────┘
           │                     │                   │
           ▼                     ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│             Database Layer (Drizzle ORM)                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Lazy getDb() Connection Manager                      │  │
│  │  - Remote / Neon: @neondatabase/serverless (HTTP)     │  │
│  │  - Localhost: node-postgres Pool (TCP)                │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL (Neon / Local PG17)                 │
│                                                             │
│  Tables: user, session, account, verification,              │
│          documents (JSONB), document_shares                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model & Access Control Contract

### 2.1 Database Schema
The database schema (`src/db/schema.ts`) uses PostgreSQL via Drizzle ORM:

1. **`user`**: `id` (text PK), `name` (text), `email` (text unique), `email_verified` (boolean), `image` (text), `created_at`, `updated_at`.
2. **`session`**: `id` (text PK), `user_id` (FK user.id CASCADE), `token` (unique), `expires_at`, `ip_address`, `user_agent`, `created_at`, `updated_at`.
3. **`account`**: `id` (text PK), `account_id` (text), `provider_id` (text), `user_id` (FK user.id CASCADE), `password` (hashed), tokens, timestamps.
4. **`verification`**: `id`, `identifier`, `value`, `expires_at`, timestamps.
5. **`documents`**:
   - `id`: Text PK (21-character crypto nanoid).
   - `owner_id`: Text FK (`user.id` ON DELETE CASCADE). Indexed via `idx_documents_owner`.
   - `title`: Text (1–120 characters).
   - `content_json`: JSONB (authoritative Tiptap document tree).
   - `schema_version`: Integer (currently `1`).
   - `revision`: Integer (monotonic counter for optimistic concurrency, starts at `0`).
   - `created_at`, `updated_at`: Timestamps with time zone.
6. **`document_shares`**:
   - `document_id`: Text FK (`documents.id` ON DELETE CASCADE).
   - `user_id`: Text FK (`user.id` ON DELETE CASCADE). Indexed via `idx_shares_user`.
   - `created_at`: Timestamp with time zone.
   - Constraint: `UNIQUE(document_id, user_id)` preventing duplicate share rows.

### 2.2 Access Control Contract
All permissions are enforced directly in database SQL queries via `src/lib/access.ts`:

- **Document Read / View**:
  Query checks that either `documents.owner_id = userId` OR an `EXISTS` subquery matches `document_shares` for `(document_id, userId)`. If no match, the API returns `404 Not Found` (preventing ID enumeration).
- **Document Rename**:
  Only the owner can rename (`documents.owner_id = userId`). If a shared collaborator sends a title update, it is rejected with `403 Forbidden`.
- **Document Sharing**:
  Only the owner can view or create shares for a document (`documents.owner_id = userId`).
- **Document Content Update**:
  Permitted for owners and recipients of an active share grant, checked atomically in the SQL `UPDATE` statement.
- **Document Deletion**:
  Restricted exclusively to the owner (`documents.owner_id = userId`).

---

## 3. Editor Reuse & Adaptation from Leads Lord

The rich-text editor engine was adapted from our internal project, Leads Lord.

### 3.1 What Was Reused
1. **FontSize Extension**: Adapted `src/lib/tiptap-font-size.ts` with tightened TypeScript types and a strict whitelist of 10 standard sizes (`12px` to `36px`).
2. **Toolbar Component Patterns**: `ToolbarButton` and `ToolbarDivider` with `onMouseDown={e => e.preventDefault()}` to preserve editor text selection during toolbar interactions.
3. **Core Formatting Commands**: Selection-preserving commands for headings (H1–H4), bold, italic, underline, strikethrough, blockquote, bullet list, ordered list, text alignment (left, center, right), text colors, and highlights.
4. **Link Dialog Pattern**: Text range preservation (`linkRangeRef`) allowing URL entry and editing without losing selection.
5. **SSR Compatibility**: Configured `immediatelyRender: false` in `useEditor` to prevent hydration mismatches in Next.js App Router.

### 3.2 What Was Adapted
1. **Authoritative Format**: Leads Lord used HTML strings (`value: string`, `onChange: (html: string) => void`). This was replaced with structured JSONB (`initialContent: Record<string, unknown>`, `onContentChange: (json: Record<string, unknown>) => void`).
2. **Selection Preservation**: Leads Lord synced content via a reactive `useEffect` watching the HTML prop, which frequently resets cursor position and breaks undo history. In this implementation, `initialContent` is passed only on document load; subsequent saves do not call `setContent`.
3. **Typography Styling**: Styled with `@tailwindcss/typography` (`prose prose-slate max-w-none`) with clean page margins instead of Leads Lord's custom email table wrappers.
4. **Font Catalog**: Streamlined from 20+ arbitrary Google Fonts to a curated set of 10 readable fonts (Inter, DM Sans, Plus Jakarta Sans, Open Sans, Lato, Poppins, Georgia, Merriweather, Times New Roman, JetBrains Mono).

### 3.3 What Was Eliminated
- Email layout extensions (`emailRichLayoutExtensions`, section blocks, two-column blocks).
- Call-to-action (CTA) button generators and modal dialogs.
- Personalization tokens (e.g., `{{first_name}}`).
- Quick emoji picker and emoji rows.
- Image uploads, media modals, asset selection callbacks, and image removal controls.
- Email-specific HTML sanitization and URL rewriting routines.

---

## 4. Content Validation & Schema Enforcement

To prevent arbitrary data injection, prototype pollution, or malformed trees, all stored JSON is validated on the server (`src/lib/content-validation.ts`) prior to database writes:

- **Root Node**: Must be of type `"doc"`.
- **Node Whitelist**: Only `doc`, `paragraph`, `text`, `heading`, `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `code`, `hardBreak`, and `horizontalRule`.
- **Mark Whitelist**: Only `bold`, `italic`, `underline`, `strike`, `code`, `link`, `textStyle`, and `highlight`.
- **Attribute Whitelisting**:
  - `heading`: `level` restricted to `[1, 2, 3, 4]`.
  - `textStyle`: `fontSize` must be in `ALLOWED_FONT_SIZES`; `color` must match hex/rgb regex; `fontFamily` must be in `ALLOWED_FONT_FAMILIES`.
  - `link`: `href` must start with `http:`, `https:`, `mailto:`, `tel:`, or `#`. All other attributes (e.g., `javascript:`, event handlers) are stripped/rejected.
  - `highlight`: `color` must match hex/rgb format.
- **Limits**: Maximum depth of 20 nodes; maximum serialized payload size of 2 MiB.

---

## 5. Autosave & Conflict Resolution Lifecycle

Saving uses a multi-layered optimistic concurrency control pattern:

1. **Local Edit Generation Tracking**:
   - Every keystroke increments `localEditGenRef.current` and triggers a 3-second debounced autosave.
   - Immediate saves can be triggered via the "Save" button or `Ctrl+S` / `Cmd+S`.
2. **Atomic Compare-and-Swap (CAS)**:
   - When a save is dispatched, the request includes `{ contentJson, revision }`.
   - The server executes:
     ```sql
     UPDATE documents
     SET content_json = $1, revision = revision + 1, updated_at = NOW()
     WHERE id = $2 AND revision = $3 AND (owner_id = $4 OR EXISTS (...))
     RETURNING revision;
     ```
3. **Conflict Detection (HTTP 409)**:
   - If 0 rows are updated (because another session saved and incremented the revision), the server returns `HTTP 409 Conflict`.
   - The client transitions to the `"conflict"` state, displays an alert, preserves the user's unsaved local draft in memory, offers a "Copy draft JSON" button, and prompts the user to reload the document to inspect the remote changes.
4. **Stale Response Protection**:
   - The client only marks status as `"saved"` if the response generation covers all pending keystrokes. If the user typed further while the save request was in-flight, the UI correctly remains in `"unsaved"` state.

---

## 6. Infrastructure & Deployment Architecture

### 6.1 Dual-Driver Database Client
`src/db/index.ts` implements a lazy-initialized singleton that dynamically selects the optimal driver:
- **Neon Serverless (Cloud / Production)**: Uses `@neondatabase/serverless` over HTTP/fetch. Eliminates connection pool exhaustion in serverless Vercel Functions.
- **Node-Postgres (Local Development & Testing)**: Uses `pg.Pool` over standard TCP when `DATABASE_URL` targets `localhost` or `127.0.0.1`. Allows offline development and deterministic local CI testing without external internet dependencies.

### 6.2 Lazy Initialization for Next.js Build
To ensure `next build` completes in CI/CD without requiring live database credentials or emitting fake data:
- Database client and Better Auth instances are lazily evaluated via Proxy objects.
- App Router pages enforce `export const dynamic = "force-dynamic"`, preventing Turbopack from attempting static prerendering of database-backed routes during build time.

### 6.3 Cost & Resource Discipline
- Strict compliance with free tiers: Neon Free tier (0.5 GiB storage) and Vercel Hobby tier.
- No paid add-ons, external caching services (Redis), or third-party storage buckets (S3) required.

---

## 7. Next Priorities & Production Roadmap

1. **Read-Only / Viewer Sharing**: Add role column (`role: 'editor' | 'viewer'`) to `document_shares` table.
2. **Share Revocation**: Add DELETE endpoint to `/api/documents/[id]/shares/[userId]` with owner-only guard.
3. **3-Way Conflict Merging**: Provide side-by-side diff view on HTTP 409 conflicts.
4. **Tiptap v3 Migration**: Once ecosystem peer dependencies stabilize, upgrade Tiptap to v3 to incorporate upstream core security patches.
