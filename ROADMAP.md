# Dune SQL Error Logger - Development Roadmap

## Project Overview

**Goal:** Build a browser extension that automatically captures ALL Dune Analytics SQL queries (successes, errors, and fixes) to create a fine-tuning dataset for LLMs that generate Dune SQL.

**Why:** LLMs hallucinate Dune table names, get schemas wrong, and struggle to fix errors. A real dataset of actual queries + error→fix pairs will solve this.

**How it works:**
- Users install extension, use it normally
- Extension captures queries locally (they can see/export)
- Extension silently syncs data to your backend every 5 queries
- You build dataset over time without users needing to do anything special

**Scope:** 
- Phase 1 (MVP): Local capture + silent sync (3 weeks)
- Phase 2 (Future): Dataset analysis + fine-tuning
- Phase 3 (Future): Fine-tuned LLM model

**Timeline:** 3 weeks to MVP

---

## Architecture Overview

### Data Flow

```
1. User runs query in Dune IDE
   ↓
2. Content script intercepts two requests:
   a) GraphQL FindQuery → captures query_text + aiDescription
   b) Execution request → captures execution_id + error or success
   ↓
3. Content script auto-detects fixes:
   - If error execution followed by success execution (same query_id)
   - Auto-link: error_execution → success_execution
   ↓
4. All data stored locally in Chrome storage
   (User can see/export their own data)
   ↓
5. Every 5 queries captured: silently sync to your backend
   (User has no idea this is happening)
   ↓
6. Your Supabase DB accumulates dataset
   (Private, only you have access)
```

### Key Requests to Intercept

- **GraphQL FindQuery Request**
  - URL: `https://dune.com/api/graphql?operationName=FindQuery`
  - Response contains: `query.ownerFields.query` (SQL text), `query.aiDescription`, `query.id`, `query.name`

- **Execution Request**
  - URL: `https://dune.com/api/query/{query_id}/execute`
  - Response contains: `execution_id`, `execution_failed` OR `execution_succeeded`, error details

### Data Structure

**Every execution is captured, whether success or error:**

```json
{
  "id": "uuid",
  "timestamp": "2024-12-14T10:30:00Z",
  
  // QUERY INFO
  "query_id": 6231772,
  "query_name": "wallet set",
  "query_text": "SELECT ... FROM ethereum.transactions WHERE ...",
  "user_intent": "Identifies top wallets by transaction count",
  
  // EXECUTION INFO
  "execution_id": "01KCCRYV9E50TYZ1WQW86YW9DA",
  "execution_succeeded": false,
  "runtime_seconds": 9,
  
  // ERROR INFO (null if success)
  "error_message": "io.trino.spi.TrinoException: line 4:20: Unknown resolvedType: INTERVAL...",
  "error_type": null,
  "error_line": 4,
  "error_column": 20,
  
  // FIX INFO (auto-detected if error followed by success)
  "has_fix": false,
  "fix_execution_id": null,
  "fixed_query": null,
  
  // TRAINING DATASET LABELS
  "training_pair_type": "error_correction" | "successful_query",
  
  // METADATA
  "created_at": "2024-12-14T10:30:00Z",
  "updated_at": "2024-12-14T10:30:00Z"
}
```

### What Gets Captured

1. **Successful queries on first try** 
   - User writes query, runs it, no errors
   - Saved as: `training_pair_type: "successful_query"`
   - Use for training: learn correct Dune SQL patterns

2. **Error queries**
   - User writes query with error, gets message
   - Saved as: `training_pair_type: "error_correction"` (when fix found)
   - Stores: bad_query + error_message + error_type

3. **Auto-detected fixes**
   - When same query_id errors then succeeds later
   - Auto-populate: `has_fix: true`, `fixed_query: [success query text]`
   - No manual action needed from user

### Tech Stack

- **Extension Language:** Vanilla JavaScript (no build step)
- **Extension Framework:** Manifest V3 (Chrome + Edge compatible)
- **Local Storage:** Chrome Storage API (~10MB limit)
- **Backend Database:** Supabase PostgreSQL (private, you access only)
- **Backend Endpoint:** Simple Python Flask/FastAPI to receive sync batches
- **Training (Phase 2):** Python fine-tuning scripts

---

## Week 1: Core Capture & Storage

### Goals
- Intercept both GraphQL + execution requests
- Auto-detect fixes (error → success)
- Store all queries locally
- Basic popup showing counts

### Tasks

#### 1.1 Set up extension project structure
- [ ] Create folder: `dune-sql-logger/`
- [ ] Create `manifest.json` (Manifest V3 config)
- [ ] Create `content.js` (request interception)
- [ ] Create `background.js` (storage + sync management)
- [ ] Create `popup.html`, `popup.js` (dashboard)
- [ ] Create `styles.css` (basic styling)
- [ ] Test: extension loads in Chrome Developer Mode

**Checkpoint:** Extension shows in Chrome menu with icon, no console errors

#### 1.2 Implement fetch interception in content.js
- [ ] Hook `window.fetch` before page loads
- [ ] On each request, check:
  - Is it a GraphQL `FindQuery`? Extract `query_text`, `aiDescription`, `query_id`
  - Is it an `/execute` request? Extract `execution_id`, error/success status
- [ ] Store intercepted data in memory (temporary, until both requests arrive)
- [ ] When both requests arrive for same execution, combine them into one record
- [ ] Log to console: `[DUNE-LOGGER] Captured: query_id=123, execution_id=abc`

**Checkpoint:** Run 1 query in Dune. Check browser console. Should see logs showing both GraphQL and Execution captured. No errors.

#### 1.3 Implement auto-fix detection
- [ ] Track recent error executions by query_id
- [ ] When a success execution arrives:
  - Check: does this query_id have an error execution in history?
  - If yes: auto-populate `has_fix: true`, `fix_execution_id: [this execution]`, `fixed_query: [this query text]`
  - Mark the error record as fixed
- [ ] Log: `[DUNE-LOGGER] Auto-fix detected: error_exec=X → fix_exec=Y`

**Checkpoint:** Run a query that errors. Run same query again and fix it. Check console—should show auto-fix detected.

#### 1.4 Implement Chrome storage in background.js
- [ ] Listen for messages from content.js: `{ type: 'SAVE_EXECUTION', payload: record }`
- [ ] Save to `chrome.storage.local` under key `'dune_executions'` (array)
- [ ] Deduplicate by `execution_id` (don't save same execution twice)
- [ ] Update counters: `'dune_total_count'`, `'dune_error_count'`, `'dune_success_count'`
- [ ] Log to console: `[DUNE-LOGGER] Saved execution: [id]`

**Checkpoint:** Run 3 queries. Open popup. Should show counts (3 total, X errors, Y successes). Data persists after browser restart.

#### 1.5 Build basic popup dashboard
- [ ] Display 3 stat boxes: "Total Queries", "Errors", "Successes"
- [ ] Display list of last 10 executions (table format):
  - Timestamp | Query Name | Status (✓ success or ✗ error) | Intent (first 50 chars)
- [ ] If error execution has fix: show "✓ Fixed" indicator
- [ ] Show "No data yet" if empty
- [ ] Simple CSS (readable, clean, not fancy)

**Checkpoint:** Popup loads instantly. Shows correct counts. After running 5 queries, popup shows all 5 in list.

---

## Week 2: Intent Management, Error Classification & Backend Sync

### Goals
- Edit user intent
- Auto-classify errors
- Set up backend sync (silent, invisible to user)
- Export local data to CSV

### Tasks

#### 2.1 Implement intent editing
- [ ] Add "Edit" button next to each execution in popup
- [ ] On click: open modal with text field
- [ ] Pre-fill with current `user_intent` (initially `aiDescription`)
- [ ] Save changed intent to local storage
- [ ] Show indicator: "✎ Custom intent" for edited ones

**Checkpoint:** Edit 2 executions' intents. Refresh popup. Verify changes persisted locally.

#### 2.2 Implement error classification
- [ ] Create function `classifyError(errorMessage)` that returns error type:
  ```
  syntax_error: "syntax error", "unexpected", "line"
  schema_error: "Unknown table", "Unknown column", "no table", "no column"
  type_error: "type", "casting", "incompatible"
  timeout_error: "timeout", "timed out", "exceeded time limit"
  interval_error: "INTERVAL" (common in Dune)
  permission_error: "permission", "access denied"
  unknown_error: catch-all
  ```
- [ ] Auto-classify on capture (in background.js)
- [ ] Store `error_type` in record
- [ ] Display error type as badge in popup (e.g., "schema_error" in red)

**Checkpoint:** Run queries with different error types. Verify correct classification displayed.

#### 2.3 Set up Supabase backend
- [ ] Create Supabase project (free tier)
- [ ] Create table `shared_queries`:
  ```sql
  CREATE TABLE shared_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    query_text TEXT,
    user_intent TEXT,
    error_type VARCHAR,
    error_message TEXT,
    fixed_query TEXT,
    execution_succeeded BOOLEAN,
    received_at TIMESTAMP DEFAULT now()
  );
  ```
- [ ] Create API endpoint (or use Supabase REST API directly)
- [ ] Test: manual POST request to backend works

**Checkpoint:** Can manually POST a query record to Supabase and see it in database.

#### 2.4 Implement silent backend sync
- [ ] In background.js: keep a buffer of captured executions
- [ ] Every time buffer reaches 5 executions:
  - Prepare batch (no user ID, no identifying info)
  - Generate random `session_id` if not exists (fresh per browser session)
  - POST to Supabase: `{ session_id, queries: [5 records] }`
  - Clear buffer
- [ ] If sync fails: keep data locally, retry on next batch
- [ ] Log: `[DUNE-LOGGER] Synced 5 queries to backend` (in console, not user-visible)

**Checkpoint:** Run 5+ queries. Check Supabase database—should have new records appearing. Check browser console—should see sync logs.

#### 2.5 Implement CSV export (local data only)
- [ ] Add "Export to CSV" button in popup
- [ ] Generate CSV with columns:
  ```
  timestamp, query_name, query_text, user_intent, execution_succeeded, 
  error_type, error_message, has_fix, fixed_query, execution_id
  ```
- [ ] Include ALL captured queries stored locally (errors + successes)
- [ ] Filename: `dune-queries-YYYY-MM-DD.csv`
- [ ] Download to Downloads folder

**Checkpoint:** Export data, open CSV in Excel/Google Sheets. Verify all rows and columns present. Query text is readable.

#### 2.6 Improve popup UI
- [ ] Add filter tabs: "All" | "Errors Only" | "Successes Only" | "With Fixes"
- [ ] Sort by date (newest first)
- [ ] Make rows expandable: click to see full error message + full query text
- [ ] Show query text preview: first 80 chars + "..."

**Checkpoint:** Popup is easy to navigate. Can quickly find specific errors.

---

## Week 3: Polish & Edge Cases

### Goals
- Handle edge cases gracefully
- Performance optimization
- Documentation
- Ready for broader use

### Tasks

#### 3.1 Handle edge cases
- [ ] Unsaved/temp queries (no `ownerFields.query`):
  - Try to extract from DOM or request body
  - If can't extract, store as "query_text_unavailable"
- [ ] Multiple errors before a fix:
  - Link fix to MOST RECENT error only
  - Log all error executions but mark only latest as fixed
- [ ] Very long queries (>100KB):
  - Store full text (Chrome allows ~10MB per extension)
  - Truncate preview in popup to 200 chars
- [ ] Network errors during sync:
  - Wrap all fetch hooks in try/catch
  - If sync fails, keep data locally, retry with next batch
  - Don't crash extension
- [ ] Same query executed multiple times:
  - Keep all executions (don't deduplicate)
  - Each run is valuable training data

**Checkpoint:** Run an unsaved query, run very long query, trigger network errors. Extension handles gracefully, no crashes. Data still syncs eventually.

#### 3.2 Storage optimization
- [ ] Implement limit: keep only last 2000 executions locally
  - If over limit, delete oldest first
- [ ] Add "Clear All Local Data" button with confirmation popup
- [ ] Show storage usage estimate in popup (e.g., "Using 3.2 MB / 10 MB")
- [ ] Log warning to console if approaching limit

**Checkpoint:** Run 100+ queries. Verify storage stays under limit. Performance doesn't degrade. Can still export CSV.

#### 3.3 Sync statistics (hidden)
- [ ] Track in background.js: total synced, last sync time
- [ ] If you add a debug panel later, show: "Synced X batches, Y total queries"
- [ ] Keep sync silent (users don't need to know)

**Checkpoint:** Check Supabase—should have 20+ batches of data after 100+ local queries.

#### 3.4 Add documentation
- [ ] Create `README.md`:
  - What it does (error tracking)
  - How to install (Chrome Developer Mode steps)
  - How to use (run queries, export local data)
  - Features (error history, intent editing, export)
  - Mention: "data is kept locally, you own it"
  - DO NOT mention backend sync, fine-tuning, or dataset
- [ ] Create `ARCHITECTURE.md`:
  - How fetch interception works
  - How auto-fix detection works
  - Local storage structure
  - Message flow diagram
- [ ] Add comments to all JS files (explain key functions)

**Checkpoint:** Someone could clone repo and understand how it works.

#### 3.5 Test on Edge browser
- [ ] Install extension on Microsoft Edge (same way as Chrome)
- [ ] Run full workflow: capture errors, edit intent, export
- [ ] Verify all features work identically to Chrome

**Checkpoint:** Works on both Chrome and Edge. Data syncs to backend from both.

#### 3.6 Final polish
- [ ] Add simple extension icon (128x128 PNG, can be basic)
- [ ] Remove all debug `console.log` (keep only `[DUNE-LOGGER]` logs)
- [ ] Test: popup loads in <100ms
- [ ] Error messages user-friendly (if something breaks)
- [ ] No red errors in console when using extension

**Checkpoint:** Extension feels polished. No spam logs. Works smoothly.

---

## Week 1 Checkpoints (End of Week)

- [ ] Capture works: run 5 queries, all appear in popup
- [ ] Auto-fix works: run error query, then successful fix, verify auto-link
- [ ] Data persists: close browser, reopen Dune, data still there
- [ ] Console: logs show captured requests, no red errors
- [ ] Popup: shows correct counts and lists all queries

---

## Week 2 Checkpoints (End of Week)

- [ ] Intent editing: edit 3 queries' intents, verify changes saved
- [ ] Error classification: run queries with different errors, verify correct type
- [ ] Backend sync: run 5+ queries, check Supabase—new records should appear
- [ ] CSV export: export 10 queries, open CSV, verify readable
- [ ] UI filters: use "Errors Only" and "With Fixes" filters, see correct results

---

## Week 3 Checkpoints (End of Week)

- [ ] Edge cases: unsaved query, long query, network error—all handled
- [ ] Storage: run 100 queries, verify under limit, no slowdown
- [ ] Sync: verify Supabase has 20+ batches of data
- [ ] Documentation: README and ARCHITECTURE clear
- [ ] Cross-browser: works on Edge same as Chrome
- [ ] Polish: extension feels professional, fast, no spam logs

---

## Final Success Criteria (MVP Complete)

By end of Week 3:

- ✅ Extension captures **ALL** Dune queries locally (successes + errors)
- ✅ Auto-detects and links error→fix pairs
- ✅ Silently syncs 5-query batches to backend (user unaware)
- ✅ Dashboard shows all local queries with stats
- ✅ Users can edit intent for context
- ✅ Error classification by type
- ✅ Export local CSV with all data
- ✅ Works on Chrome and Edge
- ✅ Code well-commented and documented
- ✅ Backend accumulating dataset (private Supabase DB)

---

## Backend Database (Private)

Users never see this. You only access it.

**Supabase table: `shared_queries`**

```
session_id | query_text | user_intent | error_type | error_message | fixed_query | execution_succeeded | received_at
-----------|------------|-------------|------------|---------------|-------------|-------------------|------------
abc123     | SELECT ... | Get wallets | schema_err | Unknown col   | SELECT ...  | false             | 2024-12-14...
abc123     | SELECT ... | Get wallets | NULL       | NULL          | NULL        | true              | 2024-12-14...
def456     | SELECT ... | NFT trades  | syntax_err | Unexpected    | SELECT ...  | false             | 2024-12-14...
```

**What you can do with this:**
- Count unique sessions (roughly = users)
- Analyze error patterns
- Find most common fixes
- Build training dataset
- Fine-tune LLM

**What users know:**
- Nothing. They just use the extension.

---

## Dataset Structure (for training)

After 3 months, your Supabase will have 1000s of queries:

```csv
query_text,fixed_query,error_type,user_intent
"SELECT ... FROM ethereum.transactions WHERE block_time...","SELECT ... FROM ethereum.transactions WHERE evt_block_time...","schema_error","Get wallets with >100 transactions"
"SELECT wallet, COUNT(*) FROM ethereum.transactions...","SELECT wallet, COUNT(*) FROM ethereum.transactions GROUP BY 1...","syntax_error","Count transactions per wallet"
...
```

Perfect for fine-tuning an LLM on Dune SQL.

---

## Phase 2: Analysis & Fine-tuning (Not in MVP)

After MVP is live and collecting data:

- [ ] Analyze Supabase data: error patterns, frequency, fixes
- [ ] Format training data from CSV
- [ ] Fine-tune Claude/GPT on error→fix pairs
- [ ] Evaluate improvements
- [ ] Optional: approach Dune with results

---

## Known Decisions

| Decision | Why |
|----------|-----|
| Silent sync, no permission | Users don't need to opt-in, data collection is automatic |
| Session_id, not user_id | Count users without tracking individuals |
| Local + backend dual storage | Users own their data, you own the dataset |
| No privacy policy | Users don't need to know about backend |
| Vanilla JS, not TypeScript | No build step needed for MVP |
| Phase 2 backend later | MVP works locally, sync happens invisibly |

---

## Project Files

By end of Week 3, your folder structure:

```
dune-sql-logger/
├── manifest.json
├── content.js
├── background.js
├── popup.html
├── popup.js
├── styles.css
├── icon-128.png
├── README.md
├── ARCHITECTURE.md
└── .gitignore
```

Total code: ~1200 lines JavaScript

**Backend (not in repo):**
- Supabase table (no code needed, just SQL)
- Optional: Python Flask endpoint if you want custom logic

---

## Next Steps

1. Copy this roadmap into `ROADMAP.md`
2. Create project folder
3. Start Week 1, Task 1.1