document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

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
                statusHtml = '<span class="status-badge status-error">Error</span>';
            }

            tr.innerHTML = `
                <td>${timeStr}</td>
                <td>#${record.query_id}</td>
                <td>${statusHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    });
}
