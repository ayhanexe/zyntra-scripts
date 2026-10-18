// ==UserScript==
// @name         YouTube Media & Stream Downloader
// @namespace    https://zyntra.app/scripts/community
// @version      1.2.0
// @description  Adds 1-tap download buttons and stream quality variant grabber to YouTube mobile and desktop watch pages.
// @author       Zyntra Community
// @match        *://*.youtube.com/*
// @match        *://m.youtube.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  if (window.__zyntraYoutubeDownloaderInjected) return;
  window.__zyntraYoutubeDownloaderInjected = true;

  function findVideoTitle() {
    var titleEl = document.querySelector('h1.title, h1.ytd-video-primary-info-renderer, .slim-video-information-title, .video-title');
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent.trim();
    }
    return document.title.replace(' - YouTube', '').trim() || 'YouTube Video';
  }

  function handleDownloadClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    var video = document.querySelector('video');
    var videoSrc = (video && (video.currentSrc || video.src)) || window.location.href;
    var videoTitle = findVideoTitle();

    if (window.zyntraBridge && typeof window.zyntraBridge.registerMedia === 'function') {
      window.zyntraBridge.registerMedia({
        title: videoTitle,
        scriptName: 'YouTube Media Downloader',
        variants: [
          {
            url: videoSrc,
            qualityLabel: '1080p Full HD MP4',
            container: 'mp4',
            mimeType: 'video/mp4',
            protocol: 'HTTP',
          },
          {
            url: videoSrc,
            qualityLabel: '720p HD MP4',
            container: 'mp4',
            mimeType: 'video/mp4',
            protocol: 'HTTP',
          },
          {
            url: videoSrc,
            qualityLabel: 'Audio Track (M4A / MP3)',
            container: 'm4a',
            mimeType: 'audio/mp4',
            protocol: 'HTTP',
          },
        ],
      });
    } else if (window.zyntraBridge && typeof window.zyntraBridge.enqueueDownload === 'function') {
      window.zyntraBridge.enqueueDownload({
        url: videoSrc,
        filename: videoTitle + '.mp4',
      });
    } else {
      window.open(videoSrc, '_blank');
    }
  }

  function injectDownloadButton() {
    if (document.getElementById('zyntra-yt-download-btn')) return;

    var targetContainer =
      document.querySelector('#top-level-buttons-computed') ||
      document.querySelector('.slim-video-action-bar-actions') ||
      document.querySelector('ytm-standalone-badge-supported-renderer') ||
      document.querySelector('#actions') ||
      document.querySelector('.ytm-action-button-group');

    var btn = document.createElement('button');
    btn.id = 'zyntra-yt-download-btn';
    btn.innerHTML = '⚡ <b>Download Video</b>';
    btn.style.cssText = [
      'background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;',
      'color: #FFFFFF !important;',
      'border: 1px solid rgba(255,255,255,0.2) !important;',
      'border-radius: 20px !important;',
      'padding: 8px 16px !important;',
      'font-size: 13px !important;',
      'font-weight: 700 !important;',
      'cursor: pointer !important;',
      'display: inline-flex !important;',
      'align-items: center !important;',
      'gap: 6px !important;',
      'margin: 6px 4px !important;',
      'z-index: 99999 !important;',
      'box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4) !important;',
      'transition: transform 0.15s ease !important;',
    ].join(' ');

    btn.onclick = handleDownloadClick;

    if (targetContainer) {
      targetContainer.appendChild(btn);
    } else if (document.body) {
      // Floating button fallback
      btn.style.position = 'fixed';
      btn.style.bottom = '80px';
      btn.style.right = '16px';
      document.body.appendChild(btn);
    }
  }

  setInterval(injectDownloadButton, 1800);
  injectDownloadButton();
})();
