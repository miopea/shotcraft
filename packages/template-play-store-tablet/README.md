# @shotcraft/template-play-store-tablet

Shotcraft template — **Google Play 7" tablet**. Composes a captured Android
tablet screen into a 1920 × 1200 landscape PNG ready for Play Console.

## Visual spec

- **Output**: 1920 × 1200 (16:10 landscape)
- **Capture viewport**: 600 × 960 CSS @ dpr 2 (raw is 1200 × 1920 portrait)
- **Layout**: asymmetric two-pane — caption + subtitle left-aligned in left
  ~36 %, tablet frame in right ~64 %, tilted toward the viewer
- **Background**: Material-coded gradient (matches `play-store-phone` so the
  two listings stay visually consistent)
- **Caption**: 96 px / 600 weight / -0.015em (left-aligned, vertically
  centered)
- **Subtitle** (optional): 44 px / 400 weight / 0.78 opacity
- **Device frame**: generic Android tablet — even bezels, small front-camera
  dot. 90 % canvas height, `perspective(2400px) rotateY(-12deg)`.
- **Drop shadow**: `40px 50px 70px rgba(0, 0, 0, 0.4)`

## Usage

```bash
pnpm add -D shotcraft @shotcraft/template-play-store-tablet
```

```ts
templates: ["@shotcraft/template-play-store-tablet"];
```

Composites land in `./screenshots/play-store-tablet/{name}-{theme}.png`.

## Samples

`samples/dashboard-{dark,light}.png` ship with the package.

## Attribution

Device-frame silhouette derived from
[`marvelapp/devices.css`](https://github.com/marvelapp/devices.css)
(Apache-2.0).

## License

MIT.
