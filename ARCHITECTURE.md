# Architecture: Dune SQL Logger

## Overview

The Dune SQL Logger is a browser extension built on the **Manifest V3** platform. It operates by intercepting network requests between the Dune IDE and its backend API to capture SQL query executions, results, and errors in real-time. It then stores this data locally and optionally synchronizes it to a self-hosted backend.

## Core Components

### 1. Content Scripts (The Capture Layer)

The extension uses a dual-script approach to bypass isolation barriers:

*   **`content_main.js` (MAIN World):** 
    *   Injects directly into the page's execution context.
    *   Intercepts `window.fetch` to capture GraphQL requests (`FindQuery`) and Execution requests (`/execution`).
    *   Uses **Script Injection** to access the Monaco Editor instance directly when the API payload is missing the SQL text (e.g., for unsaved queries).
    *   Passes captured data to the isolated world via `window.postMessage`.

*   **`content_isolated.js` (ISOLATED World):**
    *   Acts as a secure bridge.
    *   Listens for messages from `content_main.js`.
    *   Relays valid messages to the background service worker via `chrome.runtime.sendMessage`.

### 2. Background Service Worker (The Logic Layer)

*   **State Management:** Maintains the source of truth for query history in `chrome.storage.local`.
*   **Auto-Fix Detection:** 
    *   Monitors execution streams.
    *   If a query fails (Error A) and is followed by a success (Success B) for the same `query_id`, it links them.
    *   Marks the error as "Fixed" and stores the successful SQL as the "Fixed Query".
*   **Data Synchronization:**
    *   Buffers executions locally.
    *   Batches uploads to the backend (default threshold: 5 items) to minimize network traffic.
    *   Implements a "Periodic Sync" alarm (every 10 minutes) to ensure data is eventually saved even if the batch threshold isn't met.

### 3. Popup UI (The Presentation Layer)

*   **Dashboard:** Displays a filtered list of recent queries (Success, Error, Fixed).
*   **Detailed View:** Expandable rows show full SQL, full error messages, and diffs (Failed vs. Fixed SQL).
*   **Intent Management:** Allows users to manually annotate queries with descriptions or intents.
*   **CSV Export:** Generates a local CSV file of the entire history for user analysis.

## Data Flow Diagram

```
[Dune IDE]
    │
    │ (User clicks "Run")
    ▼
[content_main.js] 
    │ Intercepts fetch()
    │ Extracts SQL & Error/Success
    │
    ▼ window.postMessage
    │
[content_isolated.js]
    │
    ▼ chrome.runtime.sendMessage
    │
[background.js]
    │ 1. Classify Error (Syntax, Schema, etc.)
    │ 2. Check for Auto-Fix (Link Error -> Success)
    │ 3. Save to chrome.storage.local
    │
    ▼ (Batch > 5 OR Timer > 10m)
    │
[Backend API] (Optional)
    │ POST /sync
    ▼
[Supabase DB]
    │ Stores Query History
```

## Security & Privacy

*   **Local First:** All data is stored locally in the browser by default.
*   **Silent Sync:** Synchronization happens in the background without blocking the user interface.
*   **Permissions:** The extension requests minimal permissions (`storage`, `alarms`) and only runs on `dune.com`.
