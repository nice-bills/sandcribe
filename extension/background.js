// background.js
// Handles storage, auto-fix detection, and sync.

// Constants
const MAX_LOCAL_HISTORY = 500; // Keep last 500 executions to save space
const SESSION_ID = crypto.randomUUID();
const BACKEND_URL = 'http://localhost:8000/sync';
const SYNC_THRESHOLD = 5; // Sync every 5 new records

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('[DUNE-LOGGER-BG] Extension installed. Session:', SESSION_ID);
    
    // Create alarm for periodic sync (every 10 mins)
    chrome.alarms.create('periodic-sync', { periodInMinutes: 10 });

    chrome.storage.local.get(['dune_executions', 'dune_stats'], (result) => {
// ...
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

// Listen for periodic sync alarm
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'periodic-sync') {
        console.log('[DUNE-LOGGER-BG] Periodic sync triggered...');
        syncToBackend(true);
    }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DUNE_LOGGER_EXECUTION') {
        handleExecution(message.payload);
        sendResponse({status: 'processing'});
    } else if (message.type === 'DUNE_LOGGER_FIND_QUERY') {
        handleFindQuery(message.payload);
        sendResponse({status: 'processing'});
    } else if (message.type === 'DUNE_LOGGER_TRIGGER_SYNC') {
        // Trigger sync but don't make the sender wait for it to finish
        syncToBackend(true); 
        sendResponse({status: 'sync_triggered'});
    }
    // Return false because we sent the response synchronously above
    return false; 
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
    const graphqlEndpoint = "https://core-api.dune.com/public/graphql";
    const payload = {
        "operationName": "GetQuery",
        "variables": {"id": queryId},
        "query": `
            query GetQuery($id: Int!) {
                query(id: $id) {
                    id
                    name
                    description
                    parameters
                    ownerFields {
                        query
                    }
                }
            }
        `
    };

    try {
        const response = await fetch(graphqlEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://dune.com/'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) return null;

        const data = await response.json();
        const query = data?.data?.query;
        if (query && query.ownerFields && query.ownerFields.query) {
            return query.ownerFields.query;
        }
        return null;
    } catch (error) {
        return null;
    }
}

function classifyError(msg) {
    if (!msg) return null;
    const m = msg.toLowerCase();
    if (m.includes('syntax') || m.includes('unexpected') || m.includes('mismatched input')) return 'syntax_error';
    if (m.includes('column') && (m.includes('cannot be resolved') || m.includes('not found'))) return 'schema_error';
    if (m.includes('table') && (m.includes('does not exist') || m.includes('not found'))) return 'schema_error';
    if (m.includes('type') || m.includes('cannot cast') || m.includes('mismatch')) return 'type_error';
    if (m.includes('timeout') || m.includes('time limit') || m.includes('deadline exceeded')) return 'timeout_error';
    if (m.includes('interval')) return 'interval_error';
    if (m.includes('permission') || m.includes('access denied') || m.includes('not authorized')) return 'permission_error';
    return 'unknown_error';
}

async function handleExecution(payload) {
    try {
        if (!payload.execution_succeeded && !payload.execution_failed) return;

        const isSuccess = !!payload.execution_succeeded;
        const data = isSuccess ? payload.execution_succeeded : payload.execution_failed;
        
        const executionId = data.execution_id;
        const queryId = payload.query_id;

        if (!executionId || !queryId) return;

        const cached = queryCache.get(queryId) || {};
        let queryText = payload.query_text || cached.text || null;
        let userIntent = cached.description || null;

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
            error_type: errorType,
            query_text: queryText, 
            user_intent: userIntent,
            has_fix: false,
            fix_execution_id: null,
            synced: false
        };

        await saveExecution(record);

    } catch (err) {
        console.error('[DUNE-LOGGER-BG] Error handling execution:', err);
    }
}

async function syncToBackend(force = false) {
    try {
        const data = await chrome.storage.local.get(['dune_executions']);
        let history = data.dune_executions || [];
        
        const unsynced = history.filter(r => !r.synced);
        
        // Only sync if over threshold OR forced (e.g. from intent update)
        if (unsynced.length >= SYNC_THRESHOLD || (force && unsynced.length > 0)) {
            console.log(`[DUNE-LOGGER-BG] Syncing ${unsynced.length} records (force=${force})...`);
            
            const logs = unsynced.map(r => ({
                id: r.id,
                session_id: SESSION_ID,
                query_id: r.query_id,
                query_name: null, 
                query_text: r.query_text,
                user_intent: r.user_intent || null,
                execution_id: r.execution_id,
                execution_succeeded: r.status === 'success',
                runtime_seconds: 0,
                error_message: r.error_message,
                error_type: r.error_type,
                has_fix: r.has_fix,
                fix_execution_id: r.fix_execution_id,
                fixed_query: null,
                training_pair_type: r.status === 'success' ? 'successful_query' : 'error_correction',
                timestamp: r.timestamp
            }));

            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: SESSION_ID, logs: logs })
            });

            if (response.ok) {
                const syncedIds = new Set(unsynced.map(u => u.id));
                history = history.map(r => {
                    if (syncedIds.has(r.id)) return { ...r, synced: true };
                    return r;
                });
                
                await chrome.storage.local.set({ dune_executions: history });
                console.log('[DUNE-LOGGER-BG] Sync successful!');
            }
        }
    } catch (e) {
        console.error('[DUNE-LOGGER-BG] Sync error:', e);
    }
}

async function saveExecution(newRecord) {
    const data = await chrome.storage.local.get(['dune_executions', 'dune_stats']);
    let history = data.dune_executions || [];
    let stats = data.dune_stats || { total: 0, errors: 0, successes: 0, fixes: 0 };

    if (history.some(r => r.execution_id === newRecord.execution_id)) return;

    // Auto-fix Detection Logic: Link SUCCESS to all recent ERRORS
    if (newRecord.status === 'success') {
        let foundErrors = false;
        // Search backwards and mark all previous unfixed errors for this query_id
        for (let i = history.length - 1; i >= 0; i--) {
            const prev = history[i];
            
            // If we hit a different query_id, stop (optional, but keeps it precise)
            if (prev.query_id !== newRecord.query_id) continue;

            if (prev.status === 'error' && !prev.has_fix) {
                prev.has_fix = true;
                prev.fix_execution_id = newRecord.execution_id;
                prev.fixed_query = newRecord.query_text; // Store what actually worked
                prev.synced = false; 
                stats.fixes++;
                foundErrors = true;
            } else if (prev.status === 'success') {
                // If we hit a previous success, we've likely captured the relevant error chain
                break;
            }
        }
        if (foundErrors) console.log(`[DUNE-LOGGER-BG] Multi-fix applied for Query ${newRecord.query_id}`);
    }

    stats.total++;
    if (newRecord.status === 'success') stats.successes++;
    else stats.errors++;

    history.push(newRecord);
    if (history.length > MAX_LOCAL_HISTORY) history.shift();

    await chrome.storage.local.set({ dune_executions: history, dune_stats: stats });
    console.log('[DUNE-LOGGER-BG] Saved execution:', newRecord.status);
    
    syncToBackend();
}
