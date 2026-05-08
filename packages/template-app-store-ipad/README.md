# @shotcraft/template-app-store-ipad

Shotcraft template — **Apple App Store iPad 13" tier**. Composes a captured
iPad screen into a 2064 × 2752 PNG ready for App Store Connect.

## Visual spec

- **Output**: 2064 × 2752 (Apple's required iPad 13" submission size)
- **Capture viewport**: 1032 × 1376 CSS @ dpr 2 (raw is already 2064 × 2752)
- **Background**: 135° brand gradient (slate-900 → emerald-950 dark, slate-50
  → emerald-100 light)
- **Caption**: 128 px / 600 weight / -0.02em / 80 % canvas width
- **Subtitle** (optional): 72 px / 400 weight / 0.75 opacity
- **Device frame**: 65 % canvas width, `perspective(3200px) rotateY(-7deg) rotateX(2deg)`
- **Drop shadow**: `40px 60px 80px rgba(0, 0, 0, 0.35)`

## Usage

```bash
pnpm add -D shotcraft @shotcraft/template-app-store-ipad
```

```ts
templates: ["@shotcraft/template-app-store-ipad"];
```

Composites land in `./screenshots/app-store-ipad/{name}-{theme}.png`.

## Samples

`samples/dashboard-{dark,light}.png` ship with the package — produced by the
snapshot test against the BudgetBug example app.

## Attribution

Device-frame silhouette derived from
[`marvelapp/devices.css`](https://github.com/marvelapp/devices.css)
(Apache-2.0). Simplified to chassis outline + screen aperture + front-camera
dot.

## License

MIT.
