# docs-site

A [VitePress](https://vitepress.dev) site documenting how the Inikitty generator engine works —
built from the Markdown files in this directory. It's independent of the main `create-inikitty`
package (its own `package.json`/lockfile), since VitePress/Mermaid aren't things the CLI itself
needs at runtime.

## Develop

```sh
pnpm install
pnpm dev       # http://localhost:5173, hot-reloading
```

Or from the repo root: `pnpm docs:dev`.

## Build & self-host

```sh
pnpm build     # writes static output to .vitepress/dist/
pnpm preview   # serve that output locally to sanity-check before deploying
```

`.vitepress/dist/` is a plain static site — copy it to any web server (nginx, Caddy, S3+CDN,
GitHub Pages, etc.). No Node process needs to run in production; VitePress only runs at build time.

## Diagrams

Mermaid diagrams (` ```mermaid ` fences in the Markdown) render via
[`vitepress-plugin-mermaid`](https://github.com/emersonbottero/vitepress-plugin-mermaid) and are
pannable/zoomable in the browser via [`svg-pan-zoom`](https://github.com/bumbu/svg-pan-zoom),
wired up in `.vitepress/theme/pan-zoom.ts` — drag to pan, scroll or use the on-diagram +/− controls
to zoom, double-click to reset.
