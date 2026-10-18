# Zyntra Community Scripts & Extensions Registry

This repository hosts the public, community-driven userscripts and extension registry for **Zyntra Browser**.

## Architecture & Policy Compliance
- **Google Play Store Policy Compliant**: No copyright-infringing media downloaders, DRM circumvention, or prohibited tools are hosted here.
- **Hosted Registry**: `registry.json` serves as the official catalog endpoint fetched dynamically by Zyntra Browser.
- **Direct 1-Tap Installs**: Scripts are formatted in standard Greasemonkey/Tampermonkey `.user.js` headers with `@match`, `@name`, and `@version`.

## Repository Structure
```
zyntra-scripts/
├── registry.json             # Official community extension catalog JSON
├── youtube-downloader.user.js# YouTube Media & Stream Downloader
├── dark-reader.user.js       # Forced OLED Dark Mode
├── video-speed-master.user.js# HTML5 Video Speed Master
├── clean-reader.user.js      # Anti-Modal & Clean Reader
├── image-saver.user.js       # Hi-Res Image Saver & Zoomer
├── reading-ruler.user.js     # Reading Ruler & Focus Mode
└── smooth-scroll.user.js     # Kinetic Smooth Scrolling
```

## Adding a Script
1. Add the `.user.js` file with valid Greasemonkey metadata header comments.
2. Register the item in `registry.json`.
3. Push to `https://github.com/ayhanexe/zyntra-scripts`.
