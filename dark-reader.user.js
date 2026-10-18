// ==UserScript==
// @name         Forced OLED Dark Mode
// @namespace    https://zyntra.app/scripts/community
// @version      1.1.0
// @description  Forces clean dark mode on bright websites with high-contrast text and inversion shielding.
// @author       Zyntra Community
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  if (window.__zyntraOledDarkModeLoaded) return;
  window.__zyntraOledDarkModeLoaded = true;

  var style = document.createElement('style');
  style.id = 'zyntra-forced-oled-dark';
  style.textContent = `
    html, body {
      background-color: #050508 !important;
      color: #F1F5F9 !important;
    }
    p, span, h1, h2, h3, h4, h5, h6, li, td, th {
      color: #E2E8F0 !important;
    }
    a {
      color: #818CF8 !important;
    }
    input, textarea, select {
      background-color: #11131C !important;
      color: #FFFFFF !important;
      border: 1px solid #222638 !important;
    }
    img, video, canvas {
      filter: brightness(0.95) contrast(1.03) !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
})();
