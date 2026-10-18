// ==UserScript==
// @name         Reading Ruler & Focus Mode
// @namespace    https://zyntra.app/scripts/community
// @version      1.0.2
// @description  Follows your touch or finger with a highlighted reading strip to enhance text comprehension.
// @author       FocusLab
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  if (window.__zyntraReadingRulerInjected) return;
  window.__zyntraReadingRulerInjected = true;

  var ruler = document.createElement('div');
  ruler.id = 'zyntra-reading-ruler';
  ruler.style.cssText = 'position:fixed;left:0;right:0;height:36px;background:rgba(99,102,241,0.12);border-top:1px solid rgba(99,102,241,0.4);border-bottom:1px solid rgba(99,102,241,0.4);pointer-events:none;z-index:9999999;transition:top 0.08s ease;display:none;';
  (document.body || document.documentElement).appendChild(ruler);

  function moveRuler(y) {
    ruler.style.display = 'block';
    ruler.style.top = (y - 18) + 'px';
  }

  window.addEventListener('mousemove', function(e) {
    moveRuler(e.clientY);
  }, { passive: true });

  window.addEventListener('touchmove', function(e) {
    if (e.touches && e.touches[0]) {
      moveRuler(e.touches[0].clientY);
    }
  }, { passive: true });
})();
