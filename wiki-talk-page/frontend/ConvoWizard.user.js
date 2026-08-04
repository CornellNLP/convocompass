// ==UserScript==
// @name         ConvoWizard for Wikipedia
// @namespace    https://craft.infosci.cornell.edu/
// @version      1.0.0
// @description  AI-powered conversation insights for Wikipedia talk pages
// @author       Cornell University
// @match        https://test.wikipedia.org/*
// @match        https://*.wikipedia.org/*
// @grant        none
// @run-at       document-end
// @homepageURL  https://craft.infosci.cornell.edu/
// @supportURL   mailto:hr328@cornell.edu
// ==/UserScript==

(function() {
    'use strict';
    // Legacy testing loader (Tampermonkey path).
    // Gadget deployment workflow now lives in:
    // wiki-talk-page/gadget-package/STEP_BY_STEP_ROLLOUT.md
    
    // Only load on test.wikipedia.org for now
    if (window.location.hostname !== 'test.wikipedia.org') {
        console.log('[ConvoWizard] Currently only enabled for test.wikipedia.org');
        return;
    }
    
    // Load the ConvoWizard script via MediaWiki's loader
    if (typeof mw !== 'undefined' && mw.loader) {
        mw.loader.load('//test.wikipedia.org/w/index.php?title=User:Iamhamidrezaee/ConvoWizard.js&action=raw&ctype=text/javascript');
        console.log('[ConvoWizard] Script loaded via Tampermonkey');
    } else {
        // Fallback: inject script directly
        const script = document.createElement('script');
        script.src = '//test.wikipedia.org/w/index.php?title=User:Iamhamidrezaee/ConvoWizard.js&action=raw&ctype=text/javascript';
        document.head.appendChild(script);
        console.log('[ConvoWizard] Script injected directly');
    }
})();

