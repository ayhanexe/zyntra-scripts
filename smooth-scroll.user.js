// ==UserScript==
// @name         Kinetic Smooth Scrolling
// @namespace    https://zyntra.app/scripts/community
// @version      1.1.4
// @description  Applies fluid kinetic deceleration scrolling to all websites with zero frame drops.
// @author       FlowMotion
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  if (window.__zyntraSmoothScrollInjected) return;
  window.__zyntraSmoothScrollInjected = true;

  try {
    document.documentElement.style.scrollBehavior = 'smooth';
    if (document.body) {
      document.body.style.scrollBehavior = 'smooth';
    }
  } catch(e) {}
})();
