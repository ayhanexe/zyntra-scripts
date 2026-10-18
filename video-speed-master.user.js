// ==UserScript==
// @name         HTML5 Video Speed Master
// @namespace    https://zyntra.app/scripts/community
// @version      1.3.0
// @description  Floating speed controller overlay offering 0.25x to 4.0x fine-grained playback speed on all video players.
// @author       HyperStream Devs
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  if (window.__zyntraVideoSpeedMasterLoaded) return;
  window.__zyntraVideoSpeedMasterLoaded = true;

  function initSpeedController() {
    var videos = document.getElementsByTagName('video');
    if (!videos.length || document.getElementById('zyntra-speed-hub')) return;

    var hub = document.createElement('div');
    hub.id = 'zyntra-speed-hub';
    hub.style.cssText = 'position:fixed;bottom:70px;right:14px;background:rgba(17,19,28,0.92);border:1px solid #3B4261;border-radius:20px;padding:4px 10px;z-index:999999;display:flex;align-items:center;gap:6px;backdrop-filter:blur(8px);font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.5);';

    var speeds = [1.0, 1.25, 1.5, 2.0, 3.0];
    var currentSpeedIndex = 0;

    var label = document.createElement('span');
    label.style.cssText = 'color:#6366F1;font-size:12px;font-weight:700;min-width:32px;text-align:center;cursor:pointer;user-select:none;';
    label.textContent = '1.0x';

    label.onclick = function() {
      currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
      var speed = speeds[currentSpeedIndex];
      label.textContent = speed + 'x';
      for (var i = 0; i < videos.length; i++) {
        videos[i].playbackRate = speed;
      }
    };

    hub.appendChild(label);
    document.body.appendChild(hub);
  }

  setInterval(initSpeedController, 2500);
})();
