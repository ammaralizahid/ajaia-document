# Product Walkthrough Video Script

**Target Duration**: 3:30 – 4:30 minutes  
**Presenter**: Ammar Ali  
**Audience**: Ajaia Assessment Reviewers  

---

## 0:00 – 0:45 | Introduction & Architecture Overview

### [Visual: Browser at `http://localhost:3001/login`]
> "Hello! My name is Ammar Ali, and this is my submission for the Ajaia AI-Native Full Stack Developer assessment.
> 
> I built a lightweight, secure shared document workspace using Next.js 16 with App Router, TypeScript, Tailwind CSS, Tiptap v2, PostgreSQL with Drizzle ORM, and Better Auth.
> 
> Rather than reinventing rich-text editing from scratch, I deliberately adapted the core editor engine from Leads Lord, extracting its formatting commands, font controls, and selection preservation, while stripping out email marketing blocks and replacing HTML synchronization with authoritative PostgreSQL JSONB storage."

---

## 0:45 – 1:45 | Document Creation, Formatting & Persistence (User A)

### [Visual: Log in with `alice@ajaia.demo` / `Demo1234!` → Dashboard appears]
> "Let's log in as User A—Alice. Alice is our document owner.
> 
> On the dashboard, we have two clearly separated sections: 'My documents' and 'Shared with me'. We can see our pre-seeded sample document 'Welcome to Ajaia Docs'.
> 
> Let's create a new document by clicking 'New document'.
> 
> In the editor, notice the clean, document-oriented page canvas. Let's rename the title: I click the title at the top and type 'Q4 Product Roadmap' and press Enter. Notice the title is updated immediately.
> 
> Now let's test formatting:
> - I'll select heading 1 and type 'Project Overview'.
> - Let's add some text with bold (Ctrl+B), italic (Ctrl+I), and underline (Ctrl+U).
> - We can change font families—let's select JetBrains Mono or DM Sans.
> - We can adjust font sizes—from 14px up to 32px.
> - We have text color presets, custom color pickers, and highlight swatches.
> - We also have bullet lists, numbered lists, blockquotes, text alignment, and link insertion.
> 
> Notice the save indicator in the top bar: as I type, it shows 'Unsaved changes', and after 3 seconds of idle time, debounced autosave runs and it turns to 'Saved'. We can also press Ctrl+S or click the Save button for immediate saving.
> 
> If I refresh the browser or return to the dashboard and reopen, the title, content, and all formatting marks are completely preserved."

---

## 1:45 – 2:30 | Plain Text File Import (.txt)

### [Visual: Back to dashboard → Click 'Import .txt']
> "Next, let's test file import.
> 
> The assessment requires uploading a plain UTF-8 text file and converting it into a new editable document.
> 
> I click 'Import .txt' and select a UTF-8 text file from my computer.
> 
> Behind the scenes, the server verifies the file:
> 1. It validates the `.txt` extension and enforces a 1 MiB size limit.
> 2. It decodes the stream with a strict UTF-8 decoder and rejects binary data containing null bytes.
> 3. It parses paragraphs into native Tiptap JSON nodes, preserving literal text. If the file contains HTML tags like `<script>`, they remain literal text characters and are never rendered as active HTML.
> 
> Immediately, a new document is created with the filename as the title, and we are routed straight into the editor with all imported paragraphs ready for formatting."

---

## 2:30 – 3:30 | Asynchronous Sharing & Multi-User Collaboration (User B)

### [Visual: Inside Alice's document → Click 'Share']
> "Now let's demonstrate sharing.
> 
> The sharing model here is asynchronous shared editing with optimistic concurrency control—not marketed as real-time collaboration.
> 
> As document owner, Alice clicks 'Share'. The dialog appears. Notice that arbitrary public invites are not allowed; sharing is restricted to seeded demo accounts.
> 
> I enter `bob@ajaia.demo` and click 'Add'. Bob is added to the shared list with edit access.
> 
> Now let's sign out and sign in as User B—Bob (`bob@ajaia.demo` / `Demo1234!`).
> 
> Look at Bob's dashboard:
> - Under 'My documents', Bob has 0 documents.
> - Under 'Shared with me', the document appears with a purple 'Shared' badge and explicit attribution: 'by Alice Demo'.
> 
> Bob opens the document. Notice:
> - Bob has full rich-text editing capabilities.
> - But Bob cannot rename the document title, and the 'Share' button is not visible to Bob.
> 
> Let's make an edit as Bob: I'll add a new section 'Collaborator Notes: Reviewed and approved by Bob'. I click 'Save'.
> 
> If Alice reopens this document, she immediately sees Bob's changes."

---

## 3:30 – 4:00 | Security & Access Denial (User C)

### [Visual: Sign out → Sign in as `carol@ajaia.demo` / `Demo1234!` → Empty dashboard]
> "Now let's verify our security boundary with User C—Carol.
> 
> Carol is an unauthorized user. On Carol's dashboard, both 'My documents' and 'Shared with me' are completely empty.
> 
> What if Carol tries to access Alice's document directly by URL?
> 
> I paste Alice's document URL into the browser bar.
> 
> Access is denied: the server returns HTTP 404 with 'Document not found or you don't have access'. All authorization checks are executed as SQL predicates directly in the database queries, preventing ID enumeration or data leakage."

---

## 4:00 – 4:45 | Optimistic Concurrency, AI Workflow & Wrap-up

### [Visual: Code overview or terminal test run]
> "Finally, let's touch on technical resilience and AI workflow:
> 
> 1. **Conflict Detection**: Saves use atomic compare-and-swap on the `revision` column. If a user attempts to save against a stale revision, the server rejects it with HTTP 409 Conflict. The client preserves the local draft in memory and prompts the user to reload.
> 2. **Automated Testing**: We have 39 automated tests—19 unit tests validating content whitelists and 20 integration tests exercising the live Next.js server against a real PostgreSQL database.
> 3. **AI Collaboration**: Throughout development, AI was used as a force multiplier for extracting and refactoring Leads Lord's editor, catching a subtle boolean timestamp type mismatch in Better Auth, and generating comprehensive integration tests.
> 
> Thank you for reviewing my assessment, and I look forward to discussing the architecture further!"
