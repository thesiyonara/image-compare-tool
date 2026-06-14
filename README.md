# Image Compare Tool

A lightweight browser tool for comparing two images side by side, blinking between them, and highlighting visual differences.

Live app: https://image-compare-tool-liart.vercel.app

Everything runs locally in the browser. Images are not uploaded to a server.

## Features

- Local PNG/JPEG/WebP upload picker for selecting two images at once
- Built-in Good and Bad example pairs for quick testing
- Active source highlighting for examples or custom uploads
- Side-by-side comparison with synced zoom and pan
- Display preview quality options: 25%, 50%, 75%, and Original
- Blink mode with 250ms default speed, 500ms max speed control, and manual frame toggle
- Canvas-based difference overlay with grayscale base and red highlights
- Difference threshold defaults to 15%, with the slider locked to the useful 5-20% range
- Threshold and overlay opacity controls that redraw from cached analysis data
- Instant hover notes on the comparison mode buttons
- Dimension mismatch warning

## Privacy

Images stay in your browser. The app has no backend and does not upload files to a server.

## How It Works

- **Side by side** compares both images next to each other.
- **Blink** flips between the two images so movement is easier to notice.
- **Difference** highlights changed areas in red.

Difference mode is useful for spotting image alignment changes, lighting changes, focus changes, color shifts, compression artifacts, or objects that changed between two images.

For difference checks, 10-20% is the practical threshold range. Under 5% tends to show mostly noise and compression. The default is 15%.

## Performance Notes

The app starts with lightweight bundled WebP examples. The Good example pair is about 132 KB combined, and the Bad example pair is about 181 KB combined.

Difference mode uses a bounded preview-resolution canvas for speed. This keeps large image files usable while still showing broad visual changes clearly.

The side-by-side and blink viewers can use capped display previews for very large images so zooming and panning stay responsive. Use Original when maximum sharpness matters more than speed.

## Local Development

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Checks

```bash
npm run lint
npm run build
```

## Production Build

```bash
npm run build
npm run preview
```

## Vercel Deploy

After authenticating with Vercel:

```bash
npx vercel deploy --prod --yes
```

The current production alias is:

https://image-compare-tool-liart.vercel.app

## GitHub Notes

- `node_modules`, `dist`, local logs, and `.vercel` are ignored.
- Example images in `public/examples` are intentionally committed because they are small and make the app useful on first load.
- There are no required environment variables.
