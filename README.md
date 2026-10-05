# Ajaia Document Editor

A lightweight, secure shared document workspace inspired by Google Docs, built for the Ajaia AI-Native Full Stack Developer assessment.

The application supports rich-text document editing, in-place document renaming, UTF-8 plain text file import, granular document sharing with seeded demo accounts, optimistic concurrency control (CAS revision tracking), owner deletion, and durable PostgreSQL persistence.

---

## 1. Quickstart & Local Setup

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` (tested on `v22.23.2`)
- **npm**: `v10.x` or later
- **PostgreSQL**: Local PostgreSQL 16/17 server or a cloud [Neon](https://neon.tech) database

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/ammaralizahid/ajaia-document.git
cd ajaia-document
npm install
```

### Step 2: Configure Environment Variables
Copy the sample environment file to `.env.local`:
```bash
cp .env.example .env.local
```

Configure the following variables in `.env.local`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/ajaia_docs_dev"
BETTER_AUTH_SECRET="your-secure-random-secret-key-at-least-32-chars"
BETTER_AUTH_URL="http://localhost:3001"
NEXT_PUBLIC_APP_URL="http://localhost:3001"
```

### Step 3: Run Database Migrations
Applies the committed SQL migrations from `./drizzle/migrations`:
```bash
npm run db:migrate
```

### Step 4: Seed Demo Accounts
Idempotently creates the 3 dedicated demo users and a sample document:
```bash
npm run seed
```

### Step 5: Start the Development Server
```bash
npm run dev
```
Open **[http://localhost:3001](http://localhost:3001)** in your browser.  
*(Port 3001 is configured by default to avoid port conflicts).*

---

## 2. Demo Accounts

The login page includes one-click quick-fill buttons for the three seeded demo accounts:

| Account | Email | Password | Role & Purpose |
| :--- | :--- | :--- | :--- |
| **User A** | `alice@ajaia.demo` | `Demo1234!` | **Document Owner**: Create, edit, rename, delete, and share documents |
| **User B** | `bob@ajaia.demo` | `Demo1234!` | **Collaborator**: Edit shared documents under "Shared with me" (cannot rename, delete, or re-share) |
| **User C** | `carol@ajaia.demo` | `Demo1234!` | **Unauthorized User**: Demonstrates access control (cannot see or access Alice/Bob's documents) |

*Public registration is disabled at the API level (`databaseHooks.user.create.before`) to prevent unauthorized signups.*

---

## 3. Core Features & Capabilities

1. **Document Creation & Browser Editing**:
   - Create new documents from the dashboard or import existing `.txt` files.
   - Click-to-rename document titles in-place (owner-only, 120-character limit).
   - Rich-text editor toolbar:
     - Basic marks: **Bold**, *Italic*, <u>Underline</u>, ~~Strikethrough~~
     - Headings: Paragraph, Heading 1, Heading 2, Heading 3, Heading 4
     - Structure: Bulleted lists, numbered lists, blockquotes
     - Styling: Text colors, highlight colors, custom font family (Inter, Roboto, Playfair Display, Merriweather, Poppins, JetBrains Mono), custom font sizes (12px to 32px), text alignment (left, center, right)
     - Utilities: Insert/edit links, clear formatting, undo/redo stack
2. **File Upload & Import Workflow**:
   - "Import .txt" button on the dashboard header.
   - Supports UTF-8 encoded plain text (`.txt`) up to 1 MiB.
   - Converts line breaks and paragraphs into structured Tiptap JSON blocks.
   - Rejects non-`.txt` files, oversized files, and binary files with null bytes. Literal HTML is preserved as plain text (never evaluated or injected).
3. **Sharing Model & Role-Based Permissions**:
   - Owners can grant collaborator access by email with customizable roles:
     - **Can Edit (Editor)**: Can edit document content; cannot rename, delete, or manage shares.
     - **Can View (Viewer)**: Read-only access (`editable={false}`). Content save operations are strictly rejected at the API and database levels with HTTP 403 Forbidden.
   - **Access Revocation**: Owners can revoke any collaborator's access at any time directly in the Share dialog (`DELETE /api/documents/:id/shares?userId=...`).
   - Visual distinction on dashboard: "My documents" (with blue Owner badge and delete action) vs "Shared with me" (with distinct `Shared (Editor)` or `Shared (Viewer)` pill badges and owner attribution).
   - In editor header: non-owners see `Shared (Editor)` or `Shared (Viewer)` along with a `View only` status badge.
4. **Export & Word Statistics**:
   - Instant export options via the Export dropdown menu in the editor header:
     - **Markdown (`.md`)**: Downloads clean CommonMark formatted text with proper headings, lists, blockquotes, and links.
     - **PDF (Print Preview)**: Custom print stylesheet formatted for A4 pages, automatically hiding headers, toolbars, and shadows.
     - **Plain Text (`.txt`)**: Downloads clean plain text stripped of markdown markup.
   - Live word and character counter in the editor header updating on every keystroke.
5. **Document Deletion**:
   - Owners can delete documents directly from dashboard cards or from inside the editor header.
   - Requires explicit confirmation via modal. Deleting cascades across all document shares.
6. **Durable Persistence & Concurrency**:
   - PostgreSQL JSONB schema storing document structure and revision counters.
   - Serialized autosave (3s debounce) + explicit Save button (`Ctrl+S` / `Cmd+S`).
   - Compare-and-Swap (CAS) optimistic concurrency control: returning HTTP 409 if a stale revision is submitted, preserving local unsaved drafts with clipboard copy options.

---

## 4. Testing & Verification

### Automated Unit Tests
31 comprehensive unit tests verifying title trimming/limits, Tiptap JSON schema structure, node/mark whitelists, URL protocol whitelists, 2 MiB payload caps, text-to-document conversion, Markdown/Plain Text export formatting, word/char counts, and role-based permissions enforcement:
```bash
npm run test:unit
```

### Integration Tests
End-to-end API integration tests exercising authentication, document CRUD, access denial, sharing grants, CAS revision conflict detection, and file imports against a real PostgreSQL database:
```bash
TEST_DATABASE_URL="postgresql://localhost:5432/ajaia_docs_test" npm run test:integration
```

### Typecheck & Linting
```bash
npm run typecheck
npm run lint
```

---

## 5. Architecture Note

### Technical Stack & Key Decisions
- **Next.js 16 (App Router) & React 19**: Server components for route security; dedicated client boundary components for interactive surfaces (`DashboardClient`, `EditorClient`, `DocumentEditor`).
- **PostgreSQL & Drizzle ORM**: Durable relational storage for users, sessions, documents, and shares. Document content is stored as native `jsonb` rather than HTML strings, preventing markup drift, sanitization overhead, and injection vulnerabilities.
- **Tiptap v2 Rich-Text Engine**: Adapted from our internal project, Leads Lord. The editor engine was decoupled from email-specific layouts and HTML state synchronization, switching to structured JSONB with cursor and undo-stack preservation.
- **Better Auth**: First-class session cookies and credential verification integrated with Drizzle ORM, with public signups blocked at the database hook level.

### Concurrency Model & Tradeoffs
- **Prioritized**: Asynchronous collaboration with optimistic revision tracking (`revision: integer`). Saves use atomic Compare-and-Swap (`WHERE id = ? AND revision = ?`). If a concurrent session saves first, the second session receives HTTP 409, preserving their uncommitted draft and preventing accidental data clobbering.
- **Intentionally Deprioritized**: Full real-time co-editing (WebSockets, Yjs, CRDTs), comments, and DOCX/PDF export were intentionally deferred to deliver a robust, dependable core editing and sharing experience within the 4-6 hour assessment timebox.

---

## 6. AI-Native Workflow Note

As an AI-forward engineer, AI tools (Claude, GitHub Copilot) were leveraged as interactive pair-programming accelerators rather than autonomous replacements:

1. **Where AI Accelerated Delivery**:
   - **Boilerplate & Extraction**: Rapidly scaffolded Drizzle schema definitions, seed scripts, and adapted the ~1,500-line rich-text editor from Leads Lord into modular Tiptap extensions.
   - **Test Generation**: Generated exhaustive edge-case test matrices for `content-validation.ts` (oversized payloads, malicious link schemes, null-byte binary detection).
   - **Schema & Query Typing**: Accelerated writing type-safe SQL queries with Drizzle ORM relations and cascading foreign keys.
2. **What Was Rejected or Corrected**:
   - **State Synchronization**: Initial AI suggestions leaned toward two-way reactive HTML string props, which cause cursor jumping and reset the undo stack. This was rejected in favor of one-time initialization with internal Tiptap state and debounced JSON emission.
   - **Auth Adapters**: Caught and corrected a subtle PostgreSQL timestamp vs boolean mismatch in Better Auth session schema definitions during migration.
   - **Over-Scoping**: Firmly rejected AI-suggested complexity like real-time WebSocket infrastructure and Yjs CRDTs to keep the solution rock-solid, focused, and resilient within the time limit.
3. **Verification**:
   - All critical paths were verified with automated unit tests (19/19 passing), clean ESLint and TypeScript compilation, and multi-user browser testing across concurrent sessions.

---

## 7. Deployment Instructions (Vercel + Neon)

1. **Database**:
   - Provision a PostgreSQL database on [Neon](https://neon.tech).
   - Run migrations and seed against the Neon database:
     ```bash
     DATABASE_URL="postgresql://...sslmode=require" npm run db:migrate
     ALLOW_SEED_SIGNUP=true DATABASE_URL="postgresql://...sslmode=require" npm run seed
     ```
2. **Application (Vercel)**:
   - Import the repository on [Vercel](https://vercel.com).
   - Set Environment Variables:
     - `DATABASE_URL`: Neon connection string
     - `BETTER_AUTH_SECRET`: Random 32+ character string (`openssl rand -base64 32`)
     - `BETTER_AUTH_URL`: Your Vercel deployment URL (e.g. `https://ajaia-docs.vercel.app`)
     - `NEXT_PUBLIC_APP_URL`: Your Vercel deployment URL
   - Deploy.

---

## 8. Assessment Submission Details

- **Candidate**: Ammar Ali (`ammar.ali.uc@gmail.com`)
- **Live Deployment URL**: `https://ajaia-document-n2fi.vercel.app`
- **Walkthrough Video**: 3-5 minute unlisted walkthrough demonstration covering User A (owner) workflow, User B (shared) workflow, User C (denied access), and `.txt` file import.
