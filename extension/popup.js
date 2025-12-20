document.addEventListener('DOMContentLoaded', () => {
    loadData();
    document.getElementById('export-btn').addEventListener('click', exportCSV);
});

function exportCSV() {
    chrome.storage.local.get(['dune_executions'], (result) => {
        const history = result.dune_executions || [];
        if (history.length === 0) {
            alert("No data to export yet.");
            return;
        }

        // Define headers
        const headers = [
            "timestamp", "query_id", "status", "error_type", "query_text", 
            "user_intent", "error_message", "execution_id", "has_fix", "fix_execution_id"
        ];

        // Create CSV content
        const csvRows = [headers.join(',')];

        for (const row of history) {
            const values = headers.map(header => {
                let val = row[header] === null || row[header] === undefined ? "" : row[header];
                // Escape double quotes by doubling them
                const escaped = String(val).replace(/"/g, '""');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        }

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `dune_history_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function saveIntent(executionId, newIntent) {
    chrome.storage.local.get(['dune_executions'], (result) => {
        const history = result.dune_executions || [];
        const index = history.findIndex(r => r.execution_id === executionId);
        
        if (index !== -1) {
            history[index].user_intent = newIntent;
            chrome.storage.local.set({ dune_executions: history }, () => {
                loadData(); // Re-render
            });
        }
    });
}

function loadData() {
    chrome.storage.local.get(['dune_executions', 'dune_stats'], (result) => {
        const stats = result.dune_stats || { total: 0, errors: 0, successes: 0, fixes: 0 };
        const history = result.dune_executions || [];

        // Update stats
        document.getElementById('total-count').textContent = stats.total;
        document.getElementById('error-count').textContent = stats.errors;
        document.getElementById('fix-count').textContent = stats.fixes;

        // Render list (last 10)
        const tbody = document.getElementById('execution-list');
        const emptyState = document.getElementById('empty-state');
        tbody.innerHTML = '';

        if (history.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // Show newest first
        const recent = history.slice().reverse().slice(0, 10);

        recent.forEach(record => {
            const tr = document.createElement('tr');
            
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
                // Show error type if available, else generic Error
                const errLabel = record.error_type || 'Error';
                statusHtml = `<span class="status-badge status-error" title="${record.error_message || ''}">${errLabel}</span>`;
            }

            // Intent / ID Column
            let intentText = record.user_intent;
            let displayIntent = '';
            
            if (intentText) {
                // Cleanup common AI prefixes
                intentText = intentText.replace(/^(Certainly!|Sure!|Here are|Here is).+?:\s*/i, '');
                
                // Truncate for display
                const MAX_LEN = 40;
                displayIntent = intentText.length > MAX_LEN 
                    ? intentText.substring(0, MAX_LEN) + '...'
                    : intentText;
            }

            const intentDisplay = intentText 
                ? `<span class="intent-text" title="${record.user_intent}">${displayIntent}</span>` 
                : `<span class="query-id">#${record.query_id || '???'}</span>`;

            tr.innerHTML = `
                <td>${timeStr}</td>
                <td class="id-cell" title="Click to edit intent">
                    ${intentDisplay} <span class="edit-icon">✎</span>
                </td>
                <td>${statusHtml}</td>
            `;

            // Bind Edit Event
            const idCell = tr.querySelector('.id-cell');
            idCell.addEventListener('click', () => {
                const current = record.user_intent || '';
                const input = prompt("Enter query intent/description:", current);
                if (input !== null) { // If not cancelled
                    saveIntent(record.execution_id, input);
                }
            });

            tbody.appendChild(tr);
        });
    });
}
