# particle-life-bg

![min+gzip](https://img.shields.io/badge/min%2Bgzip-5.8%20kB-informational)

> Particle Life (asymmetric attraction) animated canvas background. Zero-dependency core with an optional React component.

Each particle type is attracted to or repelled by the other types according to an asymmetric matrix. Cells, chains and chasers emerge on their own.

https://github.com/user-attachments/assets/1158e60e-dd3b-4d45-a922-c3b606c9a3d5

**Playground:** https://elzup.github.io/particle-life-bg/ — tune the options and copy the generated code.

## Install

```
$ npm install particle-life-bg
```

## Usage

### Vanilla

```js
import { mount } from 'particle-life-bg'

// The container should be `position: relative`. A canvas is prepended and stretched over it.
const bg = mount(document.querySelector('.hero'), {
  scheme: 'neon',
  drawStyle: ['glow', 'dots'],
  count: 1200,
  fps: 30,
})

bg.setOptions({ scheme: 'ocean' }) // partial update, keeps the pattern
bg.shuffle() // new random attraction matrix
bg.destroy()
```

Passing a `<canvas>` draws into that canvas instead of creating one.

### Web Component

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/particle-life-bg@<version>/lib/esm/element.js"></script>

<particle-life-bg scheme="neon" draw-style="glow dots" fps="30" style="height: 100vh">
  <h1>Hello</h1>
</particle-life-bg>
```

Importing `particle-life-bg/element` registers `<particle-life-bg>`. Children are rendered above the canvas, so no `position: relative` wrapper is needed.

- Attributes are the options in kebab-case (`r-max`, `draw-style`, `pause-when-hidden="false"`). `draw-style` takes a space or comma separated list, `matrix` takes a preset name or a JSON square matrix.
- Values that do not fit in an attribute go through properties: `el.matrix = [[...]]`, `el.options = { scheme: customScheme }` (these win over attributes).
- Methods: `shuffle()` `respawn()` `pause()` `resume()`, and `el.controller` for the full `Controller`.
- Another tag name: `import { defineParticleLifeBg } from "particle-life-bg/element"; defineParticleLifeBg("my-bg")`.
- Safe to import during SSR (does nothing without `customElements`).

### React

```tsx
import { ParticleLifeBg } from 'particle-life-bg/react'

<div style={{ position: 'relative' }}>
  <ParticleLifeBg scheme="fire" drawStyle="speedGlow" />
  <h1 style={{ position: 'relative' }}>Hello</h1>
</div>

// full-page background
<ParticleLifeBg style={{ position: 'fixed', zIndex: -1 }} />
```

`react` is an optional peer dependency. The root entry never imports it.

### Simulation only

`particle-life-bg/sim` exposes the simulation without the canvas, for your own renderer (WebGL, SVG, a worker, …).

```js
import {
  createWorld,
  loadWasmStep,
  randomMatrix,
  step,
} from 'particle-life-bg/sim'

const matrix = randomMatrix(5)
const world = createWorld(2000, 5, 16 / 9) // width / height of the space; height is 1
const params = { rMax: 0.1, frictionHalfLife: 0.04, forceFactor: 10 }
const stepWorld = (await loadWasmStep()) ?? step // WASM SIMD, or null where unsupported

stepWorld(world, matrix, params, 0.02) // world.x / world.y / world.types are typed arrays
```

## Size

Zero dependencies. Measured by bundling each import with esbuild (`pnpm build && pnpm size`), the same way bundlers see it.

<!-- size:start -->
| import                     |     min | min + gzip | min + brotli |                                                                                |
| -------------------------- | ------: | ---------: | -----------: | ------------------------------------------------------------------------------ |
| `mount` only               | 13.6 kB |     5.7 kB |       5.2 kB | typical vanilla usage after tree-shaking                                       |
| `particle-life-bg`         | 13.9 kB |     5.8 kB |       5.3 kB | everything exported from the main entry                                        |
| `particle-life-bg/element` | 17.0 kB |     6.9 kB |       6.3 kB | registers `<particle-life-bg>`                                                 |
| `particle-life-bg/react`   | 14.5 kB |     6.0 kB |       5.5 kB | excluding react itself                                                         |
| WASM SIMD chunk            | 38.4 kB |    14.8 kB |      13.2 kB | fetched after the first frame via dynamic import (skipped with `engine: "js"`) |
<!-- size:end -->

## Options

| option                 | default     |                                                                                                                                          |
| ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `types`                | `5`         | number of particle types (ignored when `matrix` is an array)                                                                             |
| `count`                | `1500`      | particles. Cost ≈ count × neighbours, independent of the element size                                                                    |
| `matrix`               | `'random'`  | `number[][]` (`matrix[i][j]`: how strongly i is pulled toward j, -1..1) or `'random' \| 'symmetric' \| 'snake' \| 'zero'`                |
| `seed`                 | —           | fixes the matrix and initial positions                                                                                                   |
| `rMax`                 | `0.1`       | interaction radius, relative to the element height                                                                                       |
| `frictionHalfLife`     | `0.04`      | seconds for velocity to halve; larger = more glide. `friction` is the deprecated pre-0.3 name                                            |
| `force`                | `10`        | force multiplier                                                                                                                         |
| `drawStyle`            | `'dots'`    | `dots` `glow` `trail` `streak` `links` `mono` `speedGlow` `crowdGlow`, or an array per type (repeats)                                    |
| `scheme`               | `'rainbow'` | `rainbow` `neon` `okabeIto` `ocean` `fire` `gray` `paper`, or a `ColorScheme` object                                                     |
| `colors`               | scheme      | one CSS color per type (repeats), overriding the scheme colors. Attribute: space-separated                                               |
| `background`           | scheme bg   | any CSS color, or `'transparent'`. A light `#hex` switches glow to normal blending                                                       |
| `fps`                  | `30`        | simulation (and redraw) rate. 60 for smoother motion, at twice the CPU                                                                   |
| `maxPixelRatio`        | `2`         | caps canvas resolution on high-DPI screens                                                                                               |
| `paused`               | `false`     |                                                                                                                                          |
| `pauseWhenHidden`      | `true`      | stops while off-screen or the tab is hidden                                                                                              |
| `respectReducedMotion` | `true`      | with `prefers-reduced-motion: reduce`, renders a single still frame                                                                      |
| `engine`               | `'auto'`    | `'auto'`: WASM SIMD (3.5–4.8× faster step) once loaded, JS until then and where unsupported. `'js'`: never load WASM                     |
| `spawn`                | —           | `({ count, types, aspect }) => { x, y, type? }[]` (0..1). Initial positions for the first particles, e.g. a shape or text. Property only |
| `holdMs`               | `0`         | keeps the initial layout still for this long after the element first becomes visible, then starts moving                                 |

## Demo

The playground is deployed at https://elzup.github.io/particle-life-bg/. To run it locally:

```
$ pnpm build && npx serve .
# /examples/              playground: options, matrix editor, code output, previews per screen format with load estimates
# /examples/element.html  the web component in plain HTML
```

## Development

### Benchmarks

Used to decide whether a WASM engine or another renderer is worth shipping. These benchmarks are not part of the package. The package ships only the SIMD build, embedded as base64 in `src/wasm-simd.gen.ts` so that neither CI nor your bundler needs a Rust or `.wasm` setup; `pnpm build:wasm` regenerates it.

```
$ pnpm build && pnpm build:wasm   # needs the wasm32-unknown-unknown Rust target
$ pnpm bench                      # step only, JS / WASM / WASM SIMD on Node
$ npx serve .                     # then open /examples/bench.html for the same in a browser, plus a draw bench per drawStyle
```

The browser bench is also deployed at https://elzup.github.io/particle-life-bg/examples/bench.html and measures the device that opens it.

## Credits

This library is an independent implementation, and it stands on the work of people who explored this idea before. With thanks to:

- **Jeffrey Ventrella** — [Clusters](https://www.ventrella.com/Clusters/) (around 2016), particles of several types with asymmetric attraction rules. His page notes that it inspired Tom Mohr's Particle Life.
- **CodeParade (HackerPoet)** — [Particle Life - A Game of Life Made of Particles](https://youtu.be/Z_zmZ23grXE) (video) and [source code](https://github.com/HackerPoet/Particle-Life) (MIT).
- **Tom Mohr** — [particle-life.com](https://particle-life.com/) (GPL-3.0), with the videos [How Particle Life emerges from simplicity](https://youtu.be/p4YirERTVF0) and [The code behind Particle Life](https://youtu.be/scvuli-zcRc).
- **Hunar Ahmad** — [hunar4321/particle-life](https://github.com/hunar4321/particle-life) (MIT), a compact implementation that credits Ventrella's Clusters.

No code is copied from these projects. The force curve and the friction model follow the form commonly used in Particle Life implementations.

## License

MIT © [anozon](https://anozon.me)
