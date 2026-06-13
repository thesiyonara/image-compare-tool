# Do I Have Frame Shift?

A lightweight browser tool for comparing two images and spotting frame shift, focus shift, exposure changes, color shifts, or unintended background changes.

Live app: https://image-compare-tool-liart.vercel.app

The app is designed for reviewers checking whether an edited image keeps the same scene, camera angle, framing, exposure, focus, and white balance while only adding intended people/objects and their natural shadows.

## Features

- Local PNG/JPEG/WebP upload picker for selecting two images at once
- Good and Bad example pairs for quick testing
- Active source highlighting for Good example, Bad example, or custom uploads
- Side-by-side comparison with synced zoom and pan
- Premiere-style display preview quality options: 25%, 50%, 75%, and Original
- Blink mode with 250ms default speed, 500ms max speed control, and manual frame toggle
- Canvas-based difference overlay with grayscale base and red highlights
- Difference threshold defaults to 15%, with the reviewer slider locked to the useful 5-20% range
- Threshold and overlay opacity controls that redraw from cached analysis data
- Instant hover notes on the review mode buttons
- Dimension mismatch warning

## Privacy

Images stay in the reviewer browser. The app has no backend and does not upload files to a server.

## How Reviewers Use It

- **Side by side** compares both images next to each other.
- **Blink** flips between the two images so movement is easier to notice.
- **Difference** highlights changed areas in red.

In Difference mode, only added subjects/objects and their natural shadows should turn red. If fixed background details like walls, floors, furniture edges, door frames, or scene lines turn red, that usually means frame shift, focus shift, lighting change, or color shift.

For difference review, 10-20% is the practical threshold range. Under 5% tends to show mostly noise and compression. The default is 15%.

## Performance Notes

The app starts with lightweight bundled WebP examples. The Good example pair is about 132 KB combined, and the Bad example pair is about 181 KB combined.

Difference mode uses a bounded preview-resolution canvas for speed. This keeps 16 MB to 100 MB image files usable while still showing scene-wide shifts, focus changes, lighting changes, and added objects clearly.

The side-by-side and blink viewers can use capped display previews for very large images so zooming and panning stay responsive while preserving enough detail for review. Use Original when maximum sharpness matters more than speed.

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
