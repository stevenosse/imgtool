# ✂️ ImgTool

**Cut, split and export images — right in your browser.**
Free, open source and 100% local: no accounts, no uploads, no watermarks.

**[→ Launch the app](https://stevenosse.github.io/imgtool/)** ·
[Report a bug](https://github.com/stevenosse/imgtool/issues) ·
[Contribute](#-contributing)

[![Deploy to GitHub Pages](https://github.com/stevenosse/imgtool/actions/workflows/deploy.yml/badge.svg)](https://github.com/stevenosse/imgtool/actions/workflows/deploy.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-3e8fff.svg)](https://github.com/stevenosse/imgtool/pulls)
[![Built with Vue 3](https://img.shields.io/badge/built%20with-Vue%203-42b883.svg)](https://vuejs.org)

ImgTool was built for anyone who ships game assets, sprite sheets or image sets and is
tired of heavyweight editors for a job that takes seconds. Drop an image, tell it where
to cut, and download polished pieces — everything happens on your device.

## ✨ What you get

- **🧮 Pixel-perfect grid slicing** — set columns and rows to seed evenly spaced cut
  lines, then drag any line exactly where you need it. Double-click a line to remove it.
- **🪢 Freeform lasso & polygon zones** — irregular sprite? Trace it freehand or click
  out a polygon, cut any shape you can draw, and combine zones with the grid in a single
  export.
- **🧽 One-click background removal** — edge-aware, halo-free transparency tuned for
  sprite sheets. Sample any background color straight from the image with the eyedropper.
- **✂️ Trim & format control** — crop transparent margins per piece (with padding) and
  export as PNG, JPEG or WebP with a quality dial.
- **🗜️ Individual downloads or one ZIP** — grab a single piece or the whole batch.
- **🔒 Private by design** — there is no server. Your images never leave your browser,
  which also makes it instant on any connection.

## 🚀 Try it in 10 seconds

1. Open [stevenosse.github.io/imgtool](https://stevenosse.github.io/imgtool/).
2. Drop, paste (⌘/Ctrl+V) or pick any image.
3. Type column/row counts — or grab the lasso and draw a zone.
4. Hit **Cut image**, then download pieces one by one or as a ZIP.

Works in any modern desktop browser.

## 🛠️ Development

```bash
git clone https://github.com/stevenosse/imgtool.git
cd imgtool
npm install
npm run dev      # start the dev server
npm run build    # typecheck (vue-tsc) + production build
```

Built with **Vue 3 + TypeScript + Vite**. Pushes to `main` deploy automatically to
GitHub Pages via GitHub Actions.

## 🤝 Contributing

**Contributions are very welcome — this project is built in the open and thrives on
community PRs!** Whether it's a bug fix, a new cutting mode, better copy or a typo,
it's all appreciated.

Good places to start:

- Browse [open issues](https://github.com/stevenosse/imgtool/issues) — ideas welcome too,
  open one before a big refactor so we can chat about the approach.
- Ideas we'd love help with: drag-to-move zones, per-vertex zone editing, undo/redo,
  keyboard shortcuts, i18n, tests.

In short:

1. Fork the repo and create a branch (`git checkout -b my-feature`).
2. Make your change and run `npm run build` — the typecheck must pass.
3. Open a pull request describing what and why. Keep PRs focused; small ones merge faster.

Have an idea instead of code? [Open a discussion or issue](https://github.com/stevenosse/imgtool/issues) —
feature requests shaped the freeform zones you see today.

---

Made with ✂️ and Vue 3. If ImgTool saves you time, a ⭐ on the repo helps others find it.
