// background.js
// Handles storage, auto-fix detection, and sync (future).

// Constants
const MAX_LOCAL_HISTORY = 500; // Keep last 500 executions to save space

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('[DUNE-LOGGER-BG] Extension installed.');
    chrome.storage.local.get(['dune_executions', 'dune_stats'], (result) => {
        if (!result.dune_executions) {
            chrome.storage.local.set({ dune_executions: [] });
        }
        if (!result.dune_stats) {
            chrome.storage.local.set({ 
                dune_stats: { total: 0, errors: 0, successes: 0, fixes: 0 } 
            });
        }
    });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DUNE_LOGGER_EXECUTION') {
        handleExecution(message.payload);
    } else if (message.type === 'DUNE_LOGGER_FIND_QUERY') {
        handleFindQuery(message.payload);
    }
    return true;
});

// Cache query data by Query ID
const queryCache = new Map();

function handleFindQuery(payload) {
    try {
        const queryData = payload.data?.query;
        if (queryData && queryData.id) {
            const text = queryData.ownerFields?.query;
            const aiDesc = queryData.aiDescription;
            const desc = queryData.description;
            
            // Prefer AI description, fallback to user description
            const bestDesc = aiDesc || desc;

            queryCache.set(queryData.id, { 
                text: text, 
                description: bestDesc 
            });
            console.log(`[DUNE-LOGGER-BG] Cached data for Query ${queryData.id}`);
        }
    } catch (err) {
        console.error('[DUNE-LOGGER-BG] Error handling FindQuery:', err);
    }
}

async function fetchQueryTextFromDune(queryId) {
    // ... existing code ...
}

// Helper to classify errors
function classifyError(msg) {
    if (!msg) return null;
    const m = msg.toLowerCase();
    
    // Trino/Presto/Dune specific error patterns
    if (m.includes('syntax') || m.includes('unexpected') || m.includes('mismatched input')) return 'syntax_error';
    if (m.includes('column') && (m.includes('cannot be resolved') || m.includes('not found'))) return 'schema_error';
    if (m.includes('table') && (m.includes('does not exist') || m.includes('not found'))) return 'schema_error';
    if (m.includes('type') || m.includes('cannot cast') || m.includes('mismatch')) return 'type_error';
    if (m.includes('timeout') || m.includes('time limit') || m.includes('deadline exceeded')) return 'timeout_error';
    if (m.includes('interval')) return 'interval_error'; // Common Dune/Trino interval syntax issue
    if (m.includes('permission') || m.includes('access denied') || m.includes('not authorized')) return 'permission_error';
    
    return 'unknown_error';
}

async function handleExecution(payload) {
    try {
        // payload structure: { execution_queued: ..., execution_running: ..., execution_succeeded: {...}, execution_failed: {...} }
        
        // We only care if it finished (succeeded or failed)
        if (!payload.execution_succeeded && !payload.execution_failed) {
            return; // Still running or queued
        }

        const isSuccess = !!payload.execution_succeeded;
        const data = isSuccess ? payload.execution_succeeded : payload.execution_failed;
        
        // Extract key info
        const executionId = data.execution_id;
        const queryId = payload.query_id;

        if (!executionId || !queryId) {
            console.warn('[DUNE-LOGGER-BG] Missing ID in execution data:', { executionId, queryId });
            return;
        }

        // Try to get data from cache
        const cached = queryCache.get(queryId) || {};
        let queryText = payload.query_text || cached.text || null;
        let userIntent = cached.description || null;

        // If queryText is still null, try to fetch it from Dune API
        if (!queryText && queryId) {
            queryText = await fetchQueryTextFromDune(queryId);
        }

        const errorMessage = isSuccess ? null : (data.error?.message || JSON.stringify(data.error) || "Unknown error");
        const errorType = isSuccess ? null : classifyError(errorMessage);

        const record = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            execution_id: executionId,
            query_id: queryId,
            status: isSuccess ? 'success' : 'error',
            error_message: errorMessage,
            error_type: errorType, // Added classification
            query_text: queryText, 
            user_intent: userIntent,
            has_fix: false,
            fix_execution_id: null
        };

        await saveExecution(record);

    } catch (err) {
        console.error('[DUNE-LOGGER-BG] Error handling execution:', err);
    }
}

async function saveExecution(newRecord) {
    const data = await chrome.storage.local.get(['dune_executions', 'dune_stats']);
    let history = data.dune_executions || [];
    let stats = data.dune_stats || { total: 0, errors: 0, successes: 0, fixes: 0 };

    // Deduplicate: Check if execution_id already exists
    if (history.some(r => r.execution_id === newRecord.execution_id)) {
        return; // Already saved
    }

    // Auto-fix Detection Logic
    if (newRecord.status === 'success') {
        // Look for the most recent ERROR for this same query_id that hasn't been fixed yet
        // We search backwards from the end
        for (let i = history.length - 1; i >= 0; i--) {
            const prev = history[i];
            if (prev.query_id === newRecord.query_id && prev.status === 'error' && !prev.has_fix) {
                // Found a match! Link them.
                prev.has_fix = true;
                prev.fix_execution_id = newRecord.execution_id;
                stats.fixes++;
                console.log(`[DUNE-LOGGER-BG] Auto-fix detected! Error ${prev.execution_id} -> Fix ${newRecord.execution_id}`);
                break; // Only fix the most recent one
            }
        }
    }

    // Update stats
    stats.total++;
    if (newRecord.status === 'success') stats.successes++;
    else stats.errors++;

    // Add new record
    history.push(newRecord);

    // Limit history size (Queue style)
    if (history.length > MAX_LOCAL_HISTORY) {
        history.shift(); // Remove oldest
    }

    // Save back
    await chrome.storage.local.set({ 
        dune_executions: history,
        dune_stats: stats
    });
    
    console.log('[DUNE-LOGGER-BG] Saved execution:', newRecord.status, newRecord.execution_id);
}
