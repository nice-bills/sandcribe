// debug_react.js
// Utility script to find React props containing SQL text.
// Copy and paste this ENTIRE content into the Dune Developer Console (F12).

(function() {
    console.log('[React Probe] Starting search for SQL text in DOM...');

    function scan(node, depth = 0) {
        if (!node || depth > 20) return; // Safety depth

        // Check for React Keys
        const keys = Object.keys(node).filter(k => k.startsWith('__react'));
        
        for (const key of keys) {
            try {
                const fiber = node[key];
                
                // Helper to check object for SQL-like strings
                const checkString = (str) => {
                    return typeof str === 'string' && 
                           (str.includes('SELECT') || str.includes('select')) && 
                           (str.includes('FROM') || str.includes('from'));
                };

                // 1. Check Memoized Props (Common place for text)
                if (fiber.memoizedProps) {
                    // Direct value?
                    if (checkString(fiber.memoizedProps.value)) {
                        console.log('%c[FOUND] Found in memoizedProps.value', 'color: #0f0', node);
                        console.log('Value:', fiber.memoizedProps.value);
                    }
                    // Model value?
                    if (fiber.memoizedProps.model && checkString(fiber.memoizedProps.model.getValue?.())) {
                        console.log('%c[FOUND] Found in memoizedProps.model', 'color: #0f0', node);
                        console.log('Value:', fiber.memoizedProps.model.getValue());
                    }
                    // Children text?
                    if (checkString(fiber.memoizedProps.children)) {
                        console.log('%c[FOUND] Found in memoizedProps.children', 'color: #0f0', node);
                    }
                }

                // 2. Check StateNode (The actual React component instance)
                if (fiber.stateNode) {
                    // Is it a Monaco instance?
                    if (fiber.stateNode.getValue && checkString(fiber.stateNode.getValue())) {
                        console.log('%c[FOUND] Found in stateNode.getValue()', 'color: #0f0', node);
                    }
                }

            } catch (e) {
                // Ignore circular ref errors
            }
        }

        // Recurse children
        for (let i = 0; i < node.children.length; i++) {
            scan(node.children[i], depth + 1);
        }
    }

    scan(document.body);
    console.log('[React Probe] Search complete.');
})();
