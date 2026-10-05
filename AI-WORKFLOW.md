# AI-Assisted Engineering Workflow & Technical Decision Log

**Engineer**: Ammar Ali  
**Approach**: AI-Native Full-Stack Engineering (Developer-directed architecture accelerated with AI pair-programming)

---

## 1. Engineering Philosophy & Tooling

As an AI-native full stack developer, I treat AI pair-programming tools as high-velocity accelerators for scaffolding, boilerplate generation, and rapid test expansion—while maintaining total architectural ownership, strict type verification, and deep debugging control.

### Tools Utilized:
- **AI Pair Programming Assistant**: LLM-assisted coding for boilerplate acceleration, test generation, and syntax lookup.
- **Verification & QA Tools**:
  - Chrome DevTools automation for live browser workflow testing.
  - Vitest test runner for deterministic unit and API integration testing.
  - TypeScript compiler (`tsc --noEmit`) for end-to-end type safety.
  - Next.js Turbopack compiler (`next build`) for production build verification.
  - Local PostgreSQL 17 CLI (`psql`, `createdb`, `dropdb`) for database state inspection.

---

## 2. Where AI Accelerated Delivery

1. **Extraction and Adaptation of Leads Lord RichTextEditor**:
   - Rapidly surveyed the ~1,500-line rich-text component from our internal project (Leads Lord).
   - Extracted the core Tiptap v2 formatting commands, toolbar selection preservation (`onMouseDown={e => e.preventDefault()}`), heading levels, font sizing, and link dialog range tracking.
   - Stripped away hundreds of lines of email marketing specific features (two-column blocks, CTA builders, personalization tokens, emoji pickers, asset upload handlers) to create a focused document editor.
2. **Schema Scaffolding & Drizzle Migrations**:
   - Accelerated the creation of the Drizzle schema combining Better Auth tables and document persistence tables.
   - Streamlined generating committed SQL migrations via `drizzle-kit`.
3. **Automated Test Scaffolding**:
   - Accelerated the generation of 19 unit test assertions for Tiptap JSON whitelists and `.txt` parsing.
   - Expanded 20 comprehensive integration test scenarios exercising realistic multi-user authentication, CAS concurrency, permission boundaries, and file imports against a real PostgreSQL database.

---

## 3. Developer Decision Log: Critical Interventions & Corrections

AI-generated code often looks correct on the surface but fails subtle runtime, security, or framework contracts. Below are key instances where my manual investigation, root-cause debugging, and architectural decisions overrode initial code drafts:

### 3.1 Lazy Proxy Architecture vs. Build-Time Failure
- **Issue**: Standard scaffolding instantiated `betterAuth` at the module top-level:
  ```ts
  export const auth = betterAuth({ database: drizzleAdapter(getDb(), ...) });
  ```
- **Analysis**: During `next build`, Next.js App Router evaluates route segment configurations. In isolated build environments without live database credentials, `getDb()` threw immediately, breaking production builds.
- **My Solution**: I re-architected `auth` as a lazy Proxy wrapper around a `getAuth()` singleton, and added `export const dynamic = "force-dynamic"` to dynamic pages. Route module evaluation succeeds at build time without live credentials, while runtime API calls cleanly trigger configuration checks.

### 3.2 Debugging Better Auth `emailVerified` Schema Mismatch
- **Issue**: Running the user creation routine threw:
  ```
  TypeError: value.toISOString is not a function at PgTimestamp.mapToDriverValue
  ```
- **Analysis**: Traced Drizzle's `PgTimestamp` driver mapping. The schema draft had defined `emailVerified` as a `timestamp("email_verified")`, whereas Better Auth's core engine treats `emailVerified` as a `boolean` (passing `false`). When Drizzle attempted to map the boolean value to a timestamp driver string, calling `.toISOString()` failed.
- **My Solution**: Updated `src/db/schema.ts` to `boolean("email_verified").notNull().default(false)` and regenerated migrations. User creation succeeded immediately.

### 3.3 Fixing React 19 Compiler `set-state-in-effect` Violation
- **Issue**: `npm run lint` flagged an error in `src/app/dashboard/DashboardClient.tsx`:
  ```
  Error: Calling setState synchronously within an effect can trigger cascading renders
  ```
- **Analysis**: In React 19, calling a fetch function inside `useEffect` that synchronously invokes `setLoading(true)` before the async request triggers the React compiler's cascading render warning.
- **My Solution**: Re-architected state initialization: since `loading` is already `true` by default on mount, I eliminated the synchronous `setLoading(true)` inside the effect body and structured fetch cleanup with an `ignore` flag.

### 3.4 Diagnosing Vitest CSRF Origin Rejection (HTTP 403)
- **Issue**: The integration test suite failed during `apiSignIn` with `HTTP 403 Forbidden` (`{"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}`).
- **Analysis**: Better Auth enforces strict CSRF / Origin validation on POST endpoints. Node.js native `fetch` within a test environment does not set an `Origin` header by default (unlike browsers).
- **My Solution**: Configured `Origin: BASE_URL` across all HTTP helper calls in `tests/integration.test.ts`. All 20 integration tests passed.

### 3.5 Proactive Security Patching (`drizzle-orm`)
- **Issue**: `npm audit` flagged GHSA-gpj5-g38j-94v9 on `drizzle-orm <0.45.2`.
- **Analysis**: Verified that `@better-auth/drizzle-adapter` was compatible with `drizzle-orm ^0.45.2`.
- **My Solution**: Upgraded `drizzle-orm` to `^0.45.3` with `--legacy-peer-deps`. Re-tested all 39 tests and verified zero regressions.

### 3.6 Rejecting HTML State Sync for Authoritative PostgreSQL JSONB
- **Issue**: The original Leads Lord editor synced content via HTML strings and a reactive `useEffect` watching the HTML prop.
- **Analysis**: Re-syncing HTML on keystrokes or save responses resets cursor position and destroys undo history.
- **My Solution**: Replaced HTML synchronization with structured JSONB where `initialContent` is passed once on mount, and PostgreSQL JSONB serves as authoritative persistence.

---

## 4. Verification Evidence

Every component was validated with hard evidence:
- **Linting**: `npm run lint` → 0 errors, 0 warnings.
- **Type Checking**: `npm run typecheck` → 0 errors.
- **Production Build**: `npm run build` → compiled in 896ms with Turbopack.
- **Unit Tests**: 19 / 19 passed.
- **Integration Tests**: 20 / 20 passed against live Next.js server and real PostgreSQL.
- **Browser QA**: Verified multi-user login, document creation, rich text formatting, rename, sharing, permission denial, and persistent reload.
