// ==UserScript==
// @name         Anti-Modal & Clean Reader
// @namespace    https://zyntra.app/scripts/community
// @version      1.0.5
// @description  Removes annoying newsletter popups, backdrop overlays, and reading blockers.
// @author       OpenWeb Collective
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  function cleanModals() {
    document.body.style.overflow = 'auto !important';
    document.documentElement.style.overflow = 'auto !important';
    var backdropRegex = /(modal-backdrop|overlay|paywall|newsletter-popup|interstitial)/i;
    var elements = document.querySelectorAll('div, section, aside');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var cls = el.className || '';
      var id = el.id || '';
      if (typeof cls === 'string' && (backdropRegex.test(cls) || backdropRegex.test(id))) {
        var style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute') {
          el.remove();
        }
      }
    }
  }
  setTimeout(cleanModals, 1000);
  setTimeout(cleanModals, 3000);
})();
