// content_isolated.js
// Runs in ISOLATED world. Relays messages from MAIN world to Background.

(function() {
    console.log('[DUNE-LOGGER-ISOLATED] Bridge script started.');

    window.addEventListener('message', (event) => {
        // We only accept messages from ourselves
        if (event.source !== window || !event.data || !event.data.type || !event.data.type.startsWith('DUNE_LOGGER_')) {
            return;
        }

        console.log('[DUNE-LOGGER-ISOLATED] Relaying message:', event.data.type);

        // Forward to background script
        try {
            chrome.runtime.sendMessage(event.data);
        } catch (err) {
            // Background script might be sleeping or context invalid
            console.warn('[DUNE-LOGGER-ISOLATED] Failed to send to background:', err);
        }
    });
})();
