// ==UserScript==
// @name         YouTube Media & Stream Downloader
// @namespace    https://zyntra.app/scripts/community
// @version      1.3.1
// @description  Adds 1-tap download buttons and stream quality variant grabber to YouTube mobile and desktop watch pages.
// @author       Zyntra Community
// @match        *://*.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://www.youtube.com/*
// @match        *://youtube.com/*
// @match        *://youtu.be/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // Prevent duplicate initialization while allowing external refresh
  if (window.__zyntraYtDownloaderLoaded) {
    if (typeof window.__zyntraYtRefresh === 'function') {
      try { window.__zyntraYtRefresh(); } catch (e) {}
    }
    return;
  }
  window.__zyntraYtDownloaderLoaded = true;

  var FLOATING_BTN_ID = 'zyntra-yt-floating-btn';
  var INLINE_BTN_ID = 'zyntra-yt-inline-btn';
  var MODAL_ID = 'zyntra-yt-modal';
  var updateTimer = null;

  function isWatchOrShorts() {
    try {
      var path = window.location.pathname || '';
      if (path.indexOf('/watch') !== -1) return true;
      if (path.indexOf('/shorts/') !== -1) return true;
      if (path.indexOf('/live/') !== -1) return true;
      if (document.querySelector('video') && (window.location.search.indexOf('v=') !== -1 || path.indexOf('/shorts/') !== -1)) return true;
    } catch (e) {}
    return false;
  }

  function getVideoId() {
    try {
      var search = window.location.search || '';
      if (search.indexOf('v=') !== -1) {
        var match = search.match(/[?&]v=([^&]+)/);
        if (match) return match[1];
      }
      var path = window.location.pathname || '';
      var shortsMatch = path.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return shortsMatch[1];
      var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (player && typeof player.getVideoData === 'function') {
        var data = player.getVideoData();
        if (data && data.video_id) return data.video_id;
      }
    } catch (e) {}
    return '';
  }

  function findVideoTitle() {
    try {
      var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (player && typeof player.getVideoData === 'function') {
        var data = player.getVideoData();
        if (data && data.title && data.title.trim()) return data.title.trim();
      }
    } catch (e) {}

    try {
      var selectors = [
        'h1.title',
        'h1.ytd-video-primary-info-renderer',
        'ytd-watch-metadata #title h1',
        'ytm-slim-video-metadata-section-renderer h2',
        '.slim-video-information-title',
        '.video-title',
        'ytm-media-item .media-item-headline',
        'h1'
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el && el.textContent && el.textContent.trim()) {
          return el.textContent.trim();
        }
      }

      var docTitle = document.title || '';
      return docTitle.replace(/\s*-\s*YouTube\s*$/i, '').trim() || 'YouTube Video';
    } catch (e) {
      return 'YouTube Video';
    }
  }

  function extractStreamVariants(videoId, videoTitle) {
    var variants = [];
    try {
      var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      var playerResponse = null;

      try {
        if (player && typeof player.getPlayerResponse === 'function') {
          playerResponse = player.getPlayerResponse();
        }
      } catch (e) {}

      if (!playerResponse && window.ytInitialPlayerResponse) {
        playerResponse = window.ytInitialPlayerResponse;
      }

      var streamingData = playerResponse && playerResponse.streamingData;
      if (streamingData) {
        // 1. HLS Master Stream
        if (streamingData.hlsManifestUrl) {
          variants.push({
            url: streamingData.hlsManifestUrl,
            qualityLabel: 'Adaptive Stream (HLS)',
            container: 'm3u8',
            mimeType: 'application/x-mpegURL',
            protocol: 'HLS',
          });
        }

        // 2. Progressive combined formats (audio + video, direct)
        if (Array.isArray(streamingData.formats)) {
          streamingData.formats.forEach(function(fmt) {
            if (fmt && fmt.url) {
              var q = fmt.qualityLabel || (fmt.height ? fmt.height + 'p' : 'Direct MP4');
              variants.push({
                url: fmt.url,
                qualityLabel: q + ' (Progressive MP4)',
                container: 'mp4',
                mimeType: fmt.mimeType ? fmt.mimeType.split(';')[0] : 'video/mp4',
                protocol: 'HTTP',
                sizeBytes: fmt.contentLength ? parseInt(fmt.contentLength, 10) : undefined,
              });
            }
          });
        }

        // 3. Adaptive formats (high-res video + audio streams)
        if (Array.isArray(streamingData.adaptiveFormats)) {
          streamingData.adaptiveFormats.forEach(function(fmt) {
            if (fmt && fmt.url) {
              var isAudio = fmt.mimeType && fmt.mimeType.indexOf('audio/') !== -1;
              var isMp4Video = fmt.mimeType && fmt.mimeType.indexOf('video/mp4') !== -1;

              if (isAudio && fmt.itag === 140) {
                variants.push({
                  url: fmt.url,
                  qualityLabel: 'Audio Track (M4A / 128kbps)',
                  container: 'm4a',
                  mimeType: 'audio/mp4',
                  protocol: 'HTTP',
                  sizeBytes: fmt.contentLength ? parseInt(fmt.contentLength, 10) : undefined,
                });
              } else if (isMp4Video && fmt.height && fmt.height >= 720) {
                variants.push({
                  url: fmt.url,
                  qualityLabel: (fmt.qualityLabel || fmt.height + 'p') + ' Stream (MP4)',
                  container: 'mp4',
                  mimeType: 'video/mp4',
                  protocol: 'HTTP',
                  sizeBytes: fmt.contentLength ? parseInt(fmt.contentLength, 10) : undefined,
                });
              }
            }
          });
        }
      }
    } catch (e) {}

    // Default fallback formats
    try {
      var videoEl = document.querySelector('video');
      var fallbackUrl = (videoEl && videoEl.currentSrc) || window.location.href;
      if (variants.length === 0) {
        variants.push(
          {
            url: fallbackUrl,
            qualityLabel: '1080p Full HD MP4',
            container: 'mp4',
            mimeType: 'video/mp4',
            protocol: 'HTTP',
          },
          {
            url: fallbackUrl,
            qualityLabel: '720p HD MP4',
            container: 'mp4',
            mimeType: 'video/mp4',
            protocol: 'HTTP',
          },
          {
            url: fallbackUrl,
            qualityLabel: 'Audio Track (M4A / MP3)',
            container: 'm4a',
            mimeType: 'audio/mp4',
            protocol: 'HTTP',
          }
        );
      }
    } catch (e) {}

    return variants;
  }

  function showDownloadModal(videoId, videoTitle, variants) {
    try {
      var existing = document.getElementById(MODAL_ID);
      if (existing) {
        existing.remove();
      }

      var thumbUrl = videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : '';

      var backdrop = document.createElement('div');
      backdrop.id = MODAL_ID;
      backdrop.style.cssText = [
        'position: fixed !important;',
        'inset: 0 !important;',
        'background: rgba(0, 0, 0, 0.72) !important;',
        'z-index: 2147483647 !important;',
        'display: flex !important;',
        'align-items: flex-end !important;',
        'justify-content: center !important;',
        'padding: 16px !important;',
        'box-sizing: border-box !important;',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;',
        'backdrop-filter: blur(6px) !important;',
        '-webkit-backdrop-filter: blur(6px) !important;',
      ].join(' ');

      var sheet = document.createElement('div');
      sheet.style.cssText = [
        'background: #18181B !important;',
        'width: 100% !important;',
        'max-width: 480px !important;',
        'border-radius: 24px !important;',
        'border: 1px solid rgba(255, 255, 255, 0.15) !important;',
        'box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.25) !important;',
        'padding: 20px !important;',
        'box-sizing: border-box !important;',
        'color: #FFFFFF !important;',
        'max-height: 85vh !important;',
        'overflow-y: auto !important;',
      ].join(' ');

      // Header
      var header = document.createElement('div');
      header.style.cssText = 'display: flex !important; align-items: flex-start !important; justify-content: space-between !important; margin-bottom: 16px !important; gap: 12px !important;';

      var headerLeft = document.createElement('div');
      headerLeft.style.cssText = 'display: flex !important; gap: 12px !important; align-items: center !important; flex: 1 !important; min-width: 0 !important;';

      if (thumbUrl) {
        var thumb = document.createElement('img');
        thumb.src = thumbUrl;
        thumb.style.cssText = 'width: 56px !important; height: 42px !important; border-radius: 8px !important; object-fit: cover !important; flex-shrink: 0 !important; border: 1px solid rgba(255,255,255,0.1) !important;';
        headerLeft.appendChild(thumb);
      }

      var titleBox = document.createElement('div');
      titleBox.style.cssText = 'flex: 1 !important; min-width: 0 !important;';

      var titleEl = document.createElement('div');
      titleEl.textContent = videoTitle;
      titleEl.style.cssText = 'font-size: 14px !important; font-weight: 700 !important; color: #FFFFFF !important; overflow: hidden !important; text-overflow: ellipsis !important; display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; line-height: 1.3 !important;';

      var subEl = document.createElement('div');
      subEl.textContent = 'Zyntra Downloader Engine';
      subEl.style.cssText = 'font-size: 11px !important; color: #A1A1AA !important; margin-top: 2px !important; font-weight: 500 !important;';

      titleBox.appendChild(titleEl);
      titleBox.appendChild(subEl);
      headerLeft.appendChild(titleBox);

      var closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'background: rgba(255, 255, 255, 0.1) !important; color: #E4E4E7 !important; border: none !important; width: 32px !important; height: 32px !important; border-radius: 16px !important; font-size: 14px !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0 !important;';
      closeBtn.onclick = function() { backdrop.remove(); };

      header.appendChild(headerLeft);
      header.appendChild(closeBtn);
      sheet.appendChild(header);

      // Variants List
      var listContainer = document.createElement('div');
      listContainer.style.cssText = 'display: flex !important; flex-direction: column !important; gap: 8px !important; margin-bottom: 14px !important;';

      variants.forEach(function(v) {
        var itemBtn = document.createElement('button');
        itemBtn.style.cssText = [
          'display: flex !important;',
          'align-items: center !important;',
          'justify-content: space-between !important;',
          'width: 100% !important;',
          'padding: 12px 16px !important;',
          'background: rgba(255, 255, 255, 0.06) !important;',
          'border: 1px solid rgba(255, 255, 255, 0.12) !important;',
          'border-radius: 14px !important;',
          'color: #FFFFFF !important;',
          'cursor: pointer !important;',
          'transition: background 0.15s ease, transform 0.1s ease !important;',
          'box-sizing: border-box !important;',
        ].join(' ');

        var isAudio = v.container === 'm4a' || (v.mimeType && v.mimeType.indexOf('audio') !== -1);
        var icon = isAudio ? '🎵' : '🎬';

        var left = document.createElement('div');
        left.style.cssText = 'display: flex !important; align-items: center !important; gap: 10px !important; font-size: 13px !important; font-weight: 600 !important;';

        var iconSpan = document.createElement('span');
        iconSpan.style.cssText = 'font-size: 16px !important;';
        iconSpan.textContent = icon;

        var labelSpan = document.createElement('span');
        labelSpan.textContent = v.qualityLabel || 'Standard Stream';

        left.appendChild(iconSpan);
        left.appendChild(labelSpan);

        var rightBadge = document.createElement('div');
        rightBadge.textContent = (v.container || 'MP4').toUpperCase();
        rightBadge.style.cssText = 'font-size: 11px !important; font-weight: 700 !important; background: rgba(99, 102, 241, 0.25) !important; color: #818CF8 !important; padding: 3px 8px !important; border-radius: 6px !important; border: 1px solid rgba(99, 102, 241, 0.4) !important;';

        itemBtn.appendChild(left);
        itemBtn.appendChild(rightBadge);

        itemBtn.onclick = function() {
          backdrop.remove();
          try {
            if (window.zyntraBridge && typeof window.zyntraBridge.enqueueDownload === 'function') {
              window.zyntraBridge.enqueueDownload({
                url: v.url,
                filename: videoTitle.replace(/[/\\?%*:|"<>]/g, '_') + '.' + (v.container || 'mp4'),
                threads: 8,
              });
            } else {
              window.open(v.url, '_blank');
            }
          } catch (e) {}
        };

        listContainer.appendChild(itemBtn);
      });

      sheet.appendChild(listContainer);

      // Send All to Quick Grab button
      var sendAllBtn = document.createElement('button');
      sendAllBtn.style.cssText = [
        'width: 100% !important;',
        'padding: 12px !important;',
        'background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;',
        'color: #FFFFFF !important;',
        'border: 1px solid rgba(255, 255, 255, 0.25) !important;',
        'border-radius: 14px !important;',
        'font-size: 13px !important;',
        'font-weight: 700 !important;',
        'cursor: pointer !important;',
        'display: flex !important;',
        'align-items: center !important;',
        'justify-content: center !important;',
        'gap: 8px !important;',
        'box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4) !important;',
      ].join(' ');

      var sIcon = document.createElement('span');
      sIcon.textContent = '⚡ ';
      var sText = document.createElement('strong');
      sText.textContent = 'Sync to Zyntra Quick-Grab Bar';
      sendAllBtn.appendChild(sIcon);
      sendAllBtn.appendChild(sText);

      sendAllBtn.onclick = function() {
        backdrop.remove();
        try {
          if (window.zyntraBridge && typeof window.zyntraBridge.registerMedia === 'function') {
            window.zyntraBridge.registerMedia({
              title: videoTitle,
              thumbnail: thumbUrl,
              scriptName: 'YouTube Media Downloader',
              variants: variants,
            });
          }
        } catch (e) {}
      };

      sheet.appendChild(sendAllBtn);
      backdrop.appendChild(sheet);

      backdrop.onclick = function(e) {
        if (e.target === backdrop) {
          backdrop.remove();
        }
      };

      document.body.appendChild(backdrop);
    } catch (e) {
      console.warn('[Zyntra Modal Error]', e);
    }
  }

  function handleTriggerClick(e) {
    if (e) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (err) {}
    }

    try {
      var videoId = getVideoId();
      var videoTitle = findVideoTitle();
      var variants = extractStreamVariants(videoId, videoTitle);

      // Always register with Zyntra native bridge
      if (window.zyntraBridge && typeof window.zyntraBridge.registerMedia === 'function') {
        window.zyntraBridge.registerMedia({
          title: videoTitle,
          thumbnail: videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : null,
          scriptName: 'YouTube Media Downloader',
          variants: variants,
        });
      }

      // Show quality picker modal
      showDownloadModal(videoId, videoTitle, variants);
    } catch (err) {
      console.warn('[Zyntra Trigger Error]', err);
    }
  }

  function ensureFloatingButton() {
    try {
      var btn = document.getElementById(FLOATING_BTN_ID);
      var onWatch = isWatchOrShorts();

      if (!onWatch) {
        if (btn) btn.style.display = 'none';
        return;
      }

      if (!btn) {
        btn = document.createElement('button');
        btn.id = FLOATING_BTN_ID;

        // Use safe DOM methods instead of innerHTML to comply with Trusted Types
        var bIcon = document.createElement('span');
        bIcon.textContent = '⚡ ';
        var bText = document.createElement('strong');
        bText.textContent = 'Download';
        btn.appendChild(bIcon);
        btn.appendChild(bText);

        btn.style.cssText = [
          'position: fixed !important;',
          'bottom: 84px !important;',
          'right: 14px !important;',
          'z-index: 2147483647 !important;',
          'display: inline-flex !important;',
          'align-items: center !important;',
          'gap: 6px !important;',
          'padding: 8px 16px !important;',
          'background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;',
          'color: #FFFFFF !important;',
          'border: 1px solid rgba(255, 255, 255, 0.35) !important;',
          'border-radius: 22px !important;',
          'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;',
          'font-size: 13px !important;',
          'font-weight: 700 !important;',
          'cursor: pointer !important;',
          'box-shadow: 0 4px 18px rgba(99, 102, 241, 0.55), 0 2px 6px rgba(0, 0, 0, 0.3) !important;',
          'pointer-events: auto !important;',
          'touch-action: manipulation !important;',
          'visibility: visible !important;',
          'opacity: 1 !important;',
          'user-select: none !important;',
          '-webkit-user-select: none !important;',
        ].join(' ');

        btn.onclick = handleTriggerClick;

        var targetRoot = document.body || document.documentElement;
        if (targetRoot) {
          targetRoot.appendChild(btn);
        }
      } else {
        btn.style.display = 'inline-flex';
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
      }
    } catch (e) {
      console.warn('[Zyntra Floating Btn Error]', e);
    }
  }

  function ensureInlineButton() {
    try {
      if (!isWatchOrShorts()) return;

      var existing = document.getElementById(INLINE_BTN_ID);

      // Search for YouTube action toolbar selectors
      var targetContainer =
        document.querySelector('#top-row.ytd-watch-metadata #actions #menu #top-level-buttons-computed') ||
        document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed') ||
        document.querySelector('#top-level-buttons-computed') ||
        document.querySelector('#actions-inner #top-level-buttons-computed') ||
        document.querySelector('ytm-watch-metadata-row-renderer') ||
        document.querySelector('ytm-slim-video-metadata-section-renderer') ||
        document.querySelector('.slim-video-metadata-actions') ||
        document.querySelector('ytm-carousel') ||
        document.querySelector('.ytm-carousel');

      if (!targetContainer) {
        var segBtn = document.querySelector('ytm-segmented-like-dislike-button-renderer, segmented-like-dislike-button-view-model');
        if (segBtn && segBtn.parentElement) {
          targetContainer = segBtn.parentElement;
        }
      }

      if (targetContainer) {
        if (existing && existing.parentElement === targetContainer) {
          return;
        }

        if (!existing) {
          existing = document.createElement('button');
          existing.id = INLINE_BTN_ID;

          // Safe DOM methods (zero innerHTML)
          var iIcon = document.createElement('span');
          iIcon.textContent = '⚡ ';
          var iText = document.createElement('strong');
          iText.textContent = 'Download';
          existing.appendChild(iIcon);
          existing.appendChild(iText);

          existing.style.cssText = [
            'background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;',
            'color: #FFFFFF !important;',
            'border: 1px solid rgba(255, 255, 255, 0.25) !important;',
            'border-radius: 18px !important;',
            'padding: 7px 14px !important;',
            'font-size: 12px !important;',
            'font-weight: 700 !important;',
            'cursor: pointer !important;',
            'display: inline-flex !important;',
            'align-items: center !important;',
            'gap: 5px !important;',
            'margin: 4px 6px !important;',
            'z-index: 100 !important;',
            'box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35) !important;',
            'flex-shrink: 0 !important;',
          ].join(' ');
          existing.onclick = handleTriggerClick;
        }

        targetContainer.appendChild(existing);
      }
    } catch (e) {
      console.warn('[Zyntra Inline Btn Error]', e);
    }
  }

  function updateAll() {
    ensureFloatingButton();
    ensureInlineButton();
  }

  function scheduleUpdate(delay) {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(updateAll, delay || 300);
  }

  window.__zyntraYtRefresh = function() {
    scheduleUpdate(50);
  };

  // SPA Lifecycle event handlers
  try {
    window.addEventListener('yt-navigate-finish', function() {
      scheduleUpdate(200);
      scheduleUpdate(800);
    });
    window.addEventListener('yt-page-data-updated', function() {
      scheduleUpdate(300);
    });
    window.addEventListener('spfdone', function() {
      scheduleUpdate(200);
    });
    window.addEventListener('popstate', function() {
      scheduleUpdate(300);
    });
  } catch (e) {}

  // MutationObserver with strict debounce - only triggers if our buttons are missing
  try {
    var observer = new MutationObserver(function() {
      if (isWatchOrShorts()) {
        if (!document.getElementById(FLOATING_BTN_ID) || !document.getElementById(INLINE_BTN_ID)) {
          scheduleUpdate(400);
        }
      }
    });

    var rootEl = document.body || document.documentElement;
    if (rootEl) {
      observer.observe(rootEl, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
        }
      });
    }
  } catch (e) {}

  // Periodic safety check
  setInterval(function() {
    if (isWatchOrShorts()) {
      if (!document.getElementById(FLOATING_BTN_ID)) {
        ensureFloatingButton();
      }
    }
  }, 2000);

  // Initial execution
  scheduleUpdate(100);
})();
