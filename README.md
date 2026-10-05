# Ajaia Document Editor

A lightweight, secure shared document workspace built for the Ajaia AI-Native Full Stack Developer assessment.

Features rich-text editing (adapted from Leads Lord's Tiptap implementation), durable PostgreSQL JSONB persistence, optimistic concurrency control, asynchronous document sharing, plain text file import, and granular access control.

---

## 1. Tech Stack

- **Framework**: Next.js 16.3.8 (App Router, Turbopack, React 19.2.8, TypeScript)
- **Styling**: Tailwind CSS v4 with `@tailwindcss/typography`
- **Rich-Text Engine**: Tiptap v2 (StarterKit, Heading, Underline, Link, TextStyle, Color, Highlight, FontFamily, custom FontSize, TextAlign, Placeholder)
- **Database**: PostgreSQL (Serverless Neon HTTP driver + local Node-Postgres fallback)
- **ORM & Migrations**: Drizzle ORM (`drizzle-kit`) with committed SQL migrations
- **Authentication**: Better Auth (Email/password sessions, Drizzle adapter, public signup disabled at API level)
- **Testing**: Vitest with unit and integration test suites

---

## 2. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (tested on `v22.23.2`)
- **npm**: `v10.x` or later
- **PostgreSQL**: Local PostgreSQL 16/17 server or a remote [Neon](https://neon.tech) database

---

## 3. Environment Configuration

Create a `.env.local` file in the project root based on `.env.example`:

```bash
cp .env.example .env.local
```

### Required Variables:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (Neon or local) | `postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require` or `postgresql://localhost:5432/ajaia_docs_dev` |
| `DATABASE_MIGRATION_URL` | Optional migration connection string | Same as `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | Secret key for auth token signing (>= 32 chars) | `your-secure-random-secret-key-at-least-32-chars` |
| `BETTER_AUTH_URL` | Base URL of the application | `http://localhost:3001` |
| `NEXT_PUBLIC_APP_URL` | Public application URL | `http://localhost:3001` |
| `ALLOW_SEED_SIGNUP` | Set to `"true"` ONLY when executing seed or test setups | `"true"` |

---

## 4. Setup & Running Locally

### Step 1: Install Dependencies
```bash
npm install --legacy-peer-deps
```

### Step 2: Run Database Migrations
Applies committed SQL schema migrations from `./drizzle/migrations`:
```bash
npm run db:migrate
```

### Step 3: Seed Demo Accounts
Idempotently creates the 3 dedicated assessment demo users and a sample document:
```bash
npm run seed
```

### Step 4: Run Development Server
```bash
npm run dev
```
The application will be accessible at [http://localhost:3001](http://localhost:3001).

*(Port 3001 is used by default to prevent conflicts with occupied port 3107).*

### Production Build & Run:
```bash
npm run build
npm run start
```

---

## 5. Demo Accounts

The application includes three dedicated demo users:

| User | Email | Password | Role & Purpose |
| :--- | :--- | :--- | :--- |
| **User A** | `alice@ajaia.demo` | `Demo1234!` | **Document Owner**: Demonstrates creating, editing, renaming, and sharing documents |
| **User B** | `bob@ajaia.demo` | `Demo1234!` | **Shared Collaborator**: Demonstrates receiving edit access, viewing under "Shared with me", editing content (cannot rename/share) |
| **User C** | `carol@ajaia.demo` | `Demo1234!` | **Unauthorized User**: Demonstrates strict access control (cannot see or access A/B documents) |

Public signup is disabled at the API level (`databaseHooks.user.create.before`), preventing arbitrary public registrations.

---

## 6. Testing

### Run Unit Tests
Exercises Tiptap JSON content validation, node/mark whitelists, title trimming, and plain text conversion:
```bash
npm run test:unit
```

### Run Integration Tests
Runs the complete 20-scenario suite against the live running application and a real PostgreSQL database (exercises authentication, CRUD, renaming, CAS revision conflicts, access denial, sharing, and UTF-8 `.txt` import):
```bash
# Terminal 1: Start test server
ALLOW_SEED_SIGNUP=true DATABASE_URL="postgresql://localhost:5432/ajaia_docs_test" npm run start

# Terminal 2: Run test suite
TEST_APP_URL="http://localhost:3001" TEST_DATABASE_URL="postgresql://localhost:5432/ajaia_docs_test" npm run test:integration
```

### Run All Tests:
```bash
TEST_APP_URL="http://localhost:3001" TEST_DATABASE_URL="postgresql://localhost:5432/ajaia_docs_test" npm run test:all
```

---

## 7. Supported File Import

- **Format**: Plain text files with extension `.txt`
- **Encoding**: UTF-8 only (verified via `TextDecoder("utf-8", { fatal: true })`)
- **Max File Size**: 1 MiB (HTTP 413 returned if exceeded)
- **Binary Rejection**: Rejects files containing null bytes (`\0`) with HTTP 422
- **Conversion**: Blank-line separated blocks become paragraph nodes; single line breaks become hard break nodes
- **Security**: Text is inserted as literal text nodes. Literal HTML tags (e.g. `<script>`) remain plain text characters and are never parsed as HTML elements.

---

## 8. Deployment to Vercel & Neon

1. **Database (Neon Free)**:
   - Create a free project on [Neon](https://neon.tech).
   - Copy the connection string (`postgresql://...sslmode=require`).
   - Run migrations against Neon:
     ```bash
     DATABASE_URL="<neon-connection-string>" npm run db:migrate
     ALLOW_SEED_SIGNUP=true DATABASE_URL="<neon-connection-string>" npm run seed
     ```

2. **Web Application (Vercel Hobby)**:
   - Link repository to Vercel.
   - Configure Environment Variables in Project Settings:
     - `DATABASE_URL`: Neon pooled connection string
     - `BETTER_AUTH_SECRET`: Random 32+ character string
     - `BETTER_AUTH_URL`: `https://your-vercel-domain.vercel.app`
     - `NEXT_PUBLIC_APP_URL`: `https://your-vercel-domain.vercel.app`
   - Deploy.

---

## 9. Architectural Boundaries & Intentional Limitations

- **Asynchronous Collaboration Only**: Real-time collaborative editing (WebSockets, Yjs, CRDTs) is intentionally omitted in favor of optimistic concurrency control (CAS revision increments with HTTP 409 conflict detection).
- **Sharing Model**: Owners grant edit access to seeded accounts. View-only roles, arbitrary email invitations, and public link sharing are not implemented.
- **Import Scope**: Only UTF-8 `.txt` files are supported. DOCX, Markdown, and PDF conversions are out of scope.
- **Authoritative Storage**: PostgreSQL JSONB is authoritative. LocalStorage is not used for document persistence.
