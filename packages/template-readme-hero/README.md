<p align="center">
  <img src="https://raw.githubusercontent.com/miopea/shotcraft/main/assets/logo/shotcraft-icon-240.png" alt="Shotcraft" width="96" height="96" />
</p>

# @shotcraft/template-readme-hero

Shotcraft template — **GitHub README hero**. Composes a captured mobile screen
into a 1280 × 640 PNG sized to read well as a README's hero image on both
desktop and mobile-rendered docs.

## Visual spec

- **Output**: 1280 × 640 (2:1 landscape)
- **Themes**: `dark` + `light`. Both ship as separate composites; the
  README typically swaps via:
  ```html
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./screenshots/readme-hero/hero-dark.png" />
    <img src="./screenshots/readme-hero/hero-light.png" alt="..." />
  </picture>
  ```
- **Background**: subtle gradient — README context already has lots of
  visual noise (badges, contributors, code blocks), so we keep this
  composition uncluttered
- **Caption**: 76 px / 700 weight / -0.025em (left-aligned)
- **Subtitle** (optional): 32 px / 400 weight / 0.7 opacity, max-width 540 px
- **Device frame**: iPhone Pro Max-shaped, 96 % canvas height in the right
  half, `perspective(1800px) rotateY(-10deg) rotateX(3deg)`
- **Drop shadow**: `20px 30px 50px rgba(0, 0, 0, 0.35)`

## Usage

```bash
pnpm add -D shotcraft @shotcraft/template-readme-hero
```

```ts
templates: ["@shotcraft/template-readme-hero"];
```

Composites land in `./screenshots/readme-hero/{name}-{theme}.png`.

## Samples

`samples/hero-{dark,light}.png` ship with the package.

## Attribution

Device-frame silhouette derived from
[`marvelapp/devices.css`](https://github.com/marvelapp/devices.css)
(Apache-2.0).

## License

MIT.
