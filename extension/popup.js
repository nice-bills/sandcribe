let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    document.getElementById('export-btn').addEventListener('click', exportCSV);
    
    // Bind Clear Button
    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all local history? This cannot be undone.")) {
            chrome.runtime.sendMessage({ type: 'DUNE_LOGGER_CLEAR_DATA' }, (response) => {
                loadData(); // Re-render empty state
            });
        }
    });
    
    // Bind filter buttons
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update state
            currentFilter = btn.getAttribute('data-filter');
            loadData();
        });
    });
});

function exportCSV() {
    // ... (existing exportCSV code) ...
}

function saveIntent(executionId, newIntent) {
    // ... (existing saveIntent code) ...
}

function updateStorageUsage() {
    chrome.storage.local.getBytesInUse(null, (bytes) => {
        const kb = (bytes / 1024).toFixed(1);
        const mb = (bytes / (1024 * 1024)).toFixed(2);
        const display = bytes > 1024 * 500 ? `${mb}MB` : `${kb}KB`;
        document.getElementById('storage-usage').textContent = `Storage: ${display} / 10MB`;
    });
}

function loadData() {
    updateStorageUsage();
    chrome.storage.local.get(['dune_executions', 'dune_stats'], (result) => {
        const stats = result.dune_stats || { total: 0, errors: 0, successes: 0, fixes: 0 };
        let history = result.dune_executions || [];

        // Update stats
        document.getElementById('total-count').textContent = stats.total;
        document.getElementById('error-count').textContent = stats.errors;
        document.getElementById('fix-count').textContent = stats.fixes;

        // Render list
        const tbody = document.getElementById('execution-list');
        const emptyState = document.getElementById('empty-state');
        tbody.innerHTML = '';

        // Apply Filter
        if (currentFilter === 'error') {
            history = history.filter(r => r.status === 'error');
        } else if (currentFilter === 'success') {
            history = history.filter(r => r.status === 'success');
        } else if (currentFilter === 'fixed') {
            history = history.filter(r => r.has_fix);
        }

        if (history.length === 0) {
            emptyState.textContent = currentFilter === 'all' ? "No data captured yet." : "No matching queries found.";
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // Show newest first (limit 10 of filtered results)
        const recent = history.slice().reverse().slice(0, 10);

        recent.forEach(record => {
            const tr = document.createElement('tr');
            tr.className = 'execution-row';
            
            // Time
            const date = new Date(record.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // Status Logic
            let statusHtml = '';
            if (record.has_fix) {
                statusHtml = '<span class="status-badge status-fixed">Fixed</span>';
            } else if (record.status === 'success') {
                statusHtml = '<span class="status-badge status-success">Success</span>';
            } else {
                const errLabel = record.error_type || 'Error';
                statusHtml = `<span class="status-badge status-error">${errLabel}</span>`;
            }

            // Intent / ID Column
            let intentText = record.user_intent;
            let displayIntent = '';
            
            if (intentText) {
                intentText = intentText.replace(/^(Certainly!|Sure!|Here are|Here is).+?:\s*/i, '');
                const MAX_LEN = 35;
                displayIntent = intentText.length > MAX_LEN 
                    ? intentText.substring(0, MAX_LEN) + '...'
                    : intentText;
            }

            const intentDisplay = intentText 
                ? `<span class="intent-text">${displayIntent}</span>` 
                : `<span class="query-id">#${record.query_id || '???'}</span>`;

            tr.innerHTML = `
                <td>${timeStr}</td>
                <td class="id-cell">
                    ${intentDisplay} <span class="edit-icon" title="Edit intent">✎</span>
                </td>
                <td>${statusHtml}</td>
            `;

            // Expandable Detail Row
            const detailTr = document.createElement('tr');
            detailTr.className = 'detail-row hidden';
            detailTr.innerHTML = `
                <td colspan="3">
                    <div class="detail-content">
                        ${record.error_message ? `<div class="detail-error"><strong>Error:</strong> ${record.error_message}</div>` : ''}
                        <div class="detail-sql">
                            <strong>${record.status === 'error' ? 'Failed SQL' : 'SQL'}:</strong>
                            <pre>${record.query_text || 'No SQL captured'}</pre>
                        </div>
                        ${record.fixed_query ? `
                        <div class="detail-sql fixed-sql">
                            <strong>Fixed SQL:</strong>
                            <pre>${record.fixed_query}</pre>
                        </div>` : ''}
                        <div class="detail-meta">
                            <span>Exec ID: ${record.execution_id}</span>
                            ${record.fix_execution_id ? `<span>Fixed by: ${record.fix_execution_id}</span>` : ''}
                        </div>
                    </div>
                </td>
            `;

            // Bind Events
            const editIcon = tr.querySelector('.edit-icon');
            editIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't expand when clicking edit
                const current = record.user_intent || '';
                const input = prompt("Enter query intent/description:", current);
                if (input !== null) {
                    saveIntent(record.execution_id, input);
                }
            });

            tr.addEventListener('click', () => {
                detailTr.classList.toggle('hidden');
                tr.classList.toggle('active-row');
            });

            tbody.appendChild(tr);
            tbody.appendChild(detailTr);
        });
    });
}
