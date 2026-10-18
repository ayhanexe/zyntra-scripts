// ==UserScript==
// @name         Hi-Res Image Saver & Zoomer
// @namespace    https://zyntra.app/scripts/community
// @version      1.2.2
// @description  Long-press any web image to view full resolution source.
// @author       PixelForge
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  document.addEventListener('contextmenu', function(e) {
    if (e.target && e.target.tagName === 'IMG') {
      var src = e.target.currentSrc || e.target.src;
      if (src && window.zyntraBridge) {
        window.zyntraBridge.registerMedia({
          title: (e.target.alt || 'Web Image').substring(0, 40),
          variants: [{ url: src, qualityLabel: 'Original Image', container: 'jpg', mimeType: 'image/jpeg' }]
        });
      }
    }
  }, true);
})();
