<p align="center">
  <img src="https://raw.githubusercontent.com/miopea/shotcraft/main/assets/logo/shotcraft-icon-240.png" alt="Shotcraft" width="96" height="96" />
</p>

# @shotcraft/template-play-store-phone

Shotcraft template — **Google Play phone**. Composes a captured Android phone
screen into a 1080 × 1920 PNG ready for Play Console.

## Visual spec

- **Output**: 1080 × 1920 (9:16 portrait)
- **Capture viewport**: 360 × 640 CSS @ dpr 3 (raw is 1080 × 1920)
- **Background**: Material-coded gradient — `emerald-950 → cyan-700` dark,
  `teal-50 → sky-100` light. More saturated than App Store templates so
  Play Store thumbnails hold attention against the colorful Play UI.
- **Caption**: 80 px / 600 weight / -0.015em / 82 % canvas width
- **Subtitle** (optional): 48 px / 400 weight / 0.78 opacity
- **Device frame**: Pixel-shaped — punch-hole front camera, no notch. 78 %
  canvas width, `perspective(2200px) rotateY(-8deg) rotateX(2.5deg)`.
- **Drop shadow**: `28px 46px 60px rgba(0, 0, 0, 0.32)`

## Usage

```bash
pnpm add -D shotcraft @shotcraft/template-play-store-phone
```

```ts
templates: ["@shotcraft/template-play-store-phone"];
```

Composites land in `./screenshots/play-store-phone/{name}-{theme}.png`.

## Samples

`samples/dashboard-{dark,light}.png` ship with the package.

## Attribution

Device-frame silhouette derived from
[`marvelapp/devices.css`](https://github.com/marvelapp/devices.css)
(Apache-2.0). Simplified to chassis outline + screen aperture +
punch-hole camera.

## License

MIT.
