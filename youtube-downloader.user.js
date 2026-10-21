// ==UserScript==
// @name         YouTube Media & Stream Downloader
// @namespace    https://zyntra.app/scripts/community
// @version      1.4.0
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

  // Audio itags paired with video-only adaptive streams, best first, per container
  var AUDIO_ITAGS_BY_CONTAINER = {
    mp4: [140, 141, 139],
    webm: [251, 250, 249],
  };

  var AUDIO_LABELS = {
    140: 'Audio Track (M4A / 128kbps)',
    251: 'Audio Track (WebM / Opus 160kbps)',
  };

  function parseSize(fmt) {
    return fmt && fmt.contentLength ? parseInt(fmt.contentLength, 10) : undefined;
  }

  function baseMime(fmt) {
    return fmt && fmt.mimeType ? fmt.mimeType.split(';')[0].trim() : '';
  }

  function getPlayerResponse(videoId) {
    var player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    var candidates = [];
    try {
      if (player && typeof player.getPlayerResponse === 'function') {
        candidates.push(player.getPlayerResponse());
      }
    } catch (e) {}
    if (window.ytInitialPlayerResponse) candidates.push(window.ytInitialPlayerResponse);

    var firstWithData = null;
    for (var i = 0; i < candidates.length; i++) {
      var pr = candidates[i];
      if (!pr || !pr.streamingData) continue;
      // After SPA navigation ytInitialPlayerResponse can still describe the previous video
      if (!videoId || (pr.videoDetails && pr.videoDetails.videoId === videoId)) return pr;
      if (!firstWithData) firstWithData = pr;
    }
    return firstWithData;
  }

  function pickAudioFor(container, audioFormats) {
    var itags = AUDIO_ITAGS_BY_CONTAINER[container] || [];
    for (var i = 0; i < itags.length; i++) {
      for (var j = 0; j < audioFormats.length; j++) {
        if (audioFormats[j].itag === itags[i]) return audioFormats[j];
      }
    }
    return null;
  }

  function extractStreamVariants(videoId, videoTitle) {
    var variants = [];
    try {
      var playerResponse = getPlayerResponse(videoId);
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
                itag: fmt.itag,
                sizeBytes: parseSize(fmt),
              });
            }
          });
        }

        // 3. Adaptive formats: video-only streams (MP4 / WebM VP9) paired with a matching audio
        //    stream so Zyntra can mux them natively, plus standalone audio tracks
        if (Array.isArray(streamingData.adaptiveFormats)) {
          var adaptive = streamingData.adaptiveFormats.filter(function(fmt) { return fmt && fmt.url; });
          var audioFormats = adaptive.filter(function(fmt) { return baseMime(fmt).indexOf('audio/') === 0; });
          var videoFormats = adaptive.filter(function(fmt) {
            var mime = baseMime(fmt);
            // AV1 is skipped: Android's MediaMuxer cannot write it on most devices
            return (mime === 'video/mp4' || mime === 'video/webm') && fmt.height && fmt.mimeType.indexOf('av01') === -1;
          });

          videoFormats.sort(function(a, b) {
            if (b.height !== a.height) return b.height - a.height;
            if ((b.fps || 0) !== (a.fps || 0)) return (b.fps || 0) - (a.fps || 0);
            return baseMime(a) === 'video/mp4' ? -1 : 1;
          });

          videoFormats.forEach(function(fmt) {
            var container = baseMime(fmt) === 'video/webm' ? 'webm' : 'mp4';
            var audio = pickAudioFor(container, audioFormats);
            var label = (fmt.qualityLabel || fmt.height + 'p') + (container === 'webm' ? ' (WebM VP9)' : ' (MP4)');
            variants.push({
              url: fmt.url,
              qualityLabel: label + (audio ? ' (Video+Audio)' : ' (Video only)'),
              container: container,
              mimeType: baseMime(fmt),
              protocol: 'HTTP',
              itag: fmt.itag,
              sizeBytes: parseSize(fmt),
              audioUrl: audio ? audio.url : undefined,
              audioSizeBytes: audio ? parseSize(audio) : undefined,
              audioMimeType: audio ? baseMime(audio) : undefined,
            });
          });

          [140, 251].forEach(function(itag) {
            var fmt = audioFormats.filter(function(a) { return a.itag === itag; })[0];
            if (!fmt) return;
            variants.push({
              url: fmt.url,
              qualityLabel: AUDIO_LABELS[itag],
              container: itag === 140 ? 'm4a' : 'webm',
              mimeType: baseMime(fmt),
              protocol: 'HTTP',
              itag: itag,
              sizeBytes: parseSize(fmt),
            });
          });
        }
      }
    } catch (e) {}

    return variants;
  }

  function buildFallbackVariants() {
    var variants = [];
    try {
      var videoEl = document.querySelector('video');
      var fallbackUrl = (videoEl && videoEl.currentSrc) || window.location.href;
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

      // 1. Fast Web Converter (SaveFrom - 1-Tap direct MP4 stream for Zyntra Sniffer)
      var fastBtn = document.createElement('button');
      fastBtn.style.cssText = [
        'display: flex !important;',
        'align-items: center !important;',
        'justify-content: space-between !important;',
        'width: 100% !important;',
        'padding: 13px 16px !important;',
        'background: linear-gradient(135deg, #10B981, #059669) !important;',
        'border: 1px solid rgba(255, 255, 255, 0.25) !important;',
        'border-radius: 14px !important;',
        'color: #FFFFFF !important;',
        'cursor: pointer !important;',
        'margin-bottom: 8px !important;',
        'box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35) !important;',
        'box-sizing: border-box !important;',
      ].join(' ');

      var fastLeft = document.createElement('div');
      fastLeft.style.cssText = 'display: flex !important; align-items: center !important; gap: 10px !important; font-size: 13px !important; font-weight: 700 !important;';
      var fastIcon = document.createElement('span');
      fastIcon.textContent = '🚀';
      fastIcon.style.cssText = 'font-size: 16px !important;';
      var fastLabel = document.createElement('span');
      fastLabel.textContent = '1-Tap Fast Download (SaveFrom)';
      fastLeft.appendChild(fastIcon);
      fastLeft.appendChild(fastLabel);

      var fastBadge = document.createElement('div');
      fastBadge.textContent = 'FAST MP4';
      fastBadge.style.cssText = 'font-size: 11px !important; font-weight: 700 !important; background: rgba(0, 0, 0, 0.3) !important; color: #FFFFFF !important; padding: 3px 8px !important; border-radius: 6px !important;';

      fastBtn.appendChild(fastLeft);
      fastBtn.appendChild(fastBadge);

      fastBtn.onclick = function() {
        backdrop.remove();
        var targetUrl = videoId ? 'https://ssyoutube.com/watch?v=' + videoId : ('https://ssyoutube.com/' + encodeURIComponent(window.location.href));
        window.location.href = targetUrl;
      };

      sheet.appendChild(fastBtn);

      // 2. Audio MP3 Converter (Y2Mate)
      var mp3Btn = document.createElement('button');
      mp3Btn.style.cssText = [
        'display: flex !important;',
        'align-items: center !important;',
        'justify-content: space-between !important;',
        'width: 100% !important;',
        'padding: 11px 16px !important;',
        'background: rgba(255, 255, 255, 0.08) !important;',
        'border: 1px solid rgba(255, 255, 255, 0.15) !important;',
        'border-radius: 14px !important;',
        'color: #FFFFFF !important;',
        'cursor: pointer !important;',
        'margin-bottom: 12px !important;',
        'box-sizing: border-box !important;',
      ].join(' ');

      var mp3Left = document.createElement('div');
      mp3Left.style.cssText = 'display: flex !important; align-items: center !important; gap: 10px !important; font-size: 13px !important; font-weight: 600 !important;';
      var mp3Icon = document.createElement('span');
      mp3Icon.textContent = '🎵';
      var mp3Label = document.createElement('span');
      mp3Label.textContent = 'Convert to MP3 (Y2Mate)';
      mp3Left.appendChild(mp3Icon);
      mp3Left.appendChild(mp3Label);

      var mp3Badge = document.createElement('div');
      mp3Badge.textContent = 'MP3';
      mp3Badge.style.cssText = 'font-size: 11px !important; font-weight: 700 !important; background: rgba(239, 68, 68, 0.25) !important; color: #F87171 !important; padding: 3px 8px !important; border-radius: 6px !important;';

      mp3Btn.appendChild(mp3Left);
      mp3Btn.appendChild(mp3Badge);

      mp3Btn.onclick = function() {
        backdrop.remove();
        var targetUrl = videoId ? 'https://www.y2mate.com/youtube/' + videoId : ('https://www.y2mate.com/en/search/' + encodeURIComponent(window.location.href));
        window.location.href = targetUrl;
      };

      sheet.appendChild(mp3Btn);

      // Section divider / label
      var rawSectionLabel = document.createElement('div');
      rawSectionLabel.textContent = 'Direct Intercept Streams:';
      rawSectionLabel.style.cssText = 'font-size: 11px !important; font-weight: 600 !important; color: #A1A1AA !important; margin-bottom: 8px !important; text-transform: uppercase !important; letter-spacing: 0.5px !important;';
      sheet.appendChild(rawSectionLabel);

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
                fileSizeBytes: v.sizeBytes,
                mimeType: v.mimeType,
                // Video-only adaptive streams carry their paired audio; Zyntra muxes them natively
                audioUrl: v.audioUrl,
                audioSizeBytes: v.audioSizeBytes,
                audioMimeType: v.audioMimeType,
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

  function registerVariants(videoId, videoTitle, variants) {
    if (window.zyntraBridge && typeof window.zyntraBridge.registerMedia === 'function') {
      window.zyntraBridge.registerMedia({
        title: videoTitle,
        thumbnail: videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : null,
        scriptName: 'YouTube Media Downloader',
        variants: variants,
      });
    }
  }

  // Called by Zyntra's hidden link-refresher WebView to get freshly signed stream URLs.
  // Re-reads the player response and registers its variants without opening the modal.
  // Returns how many variants were registered (0 while the player response is not ready yet;
  // Zyntra keeps calling until it finds a match).
  window.__zyntraRequestMedia = function() {
    try {
      var videoId = getVideoId();
      var videoTitle = findVideoTitle();
      var variants = extractStreamVariants(videoId, videoTitle);
      if (variants.length === 0) return 0;
      registerVariants(videoId, videoTitle, variants);
      return variants.length;
    } catch (e) {
      console.warn('[Zyntra Request Media Error]', e);
      return 0;
    }
  };

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
      if (variants.length === 0) variants = buildFallbackVariants();

      // Always register with Zyntra native bridge
      registerVariants(videoId, videoTitle, variants);

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
