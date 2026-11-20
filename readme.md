# particle-life-bg

> Particle Life (asymmetric attraction) animated canvas background. Zero-dependency core with an optional React component.

Each particle type is attracted to or repelled by the other types according to an asymmetric matrix. Cells, chains and chasers emerge on their own.

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

## Options

| option                 | default     |                                                                                                                           |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `types`                | `5`         | number of particle types (ignored when `matrix` is an array)                                                              |
| `count`                | `1500`      | particles. Cost ≈ count × neighbours, independent of the element size                                                     |
| `matrix`               | `'random'`  | `number[][]` (`matrix[i][j]`: how strongly i is pulled toward j, -1..1) or `'random' \| 'symmetric' \| 'snake' \| 'zero'` |
| `seed`                 | —           | fixes the matrix and initial positions                                                                                    |
| `rMax`                 | `0.1`       | interaction radius, relative to the element height                                                                        |
| `friction`             | `0.04`      | velocity half-life in seconds                                                                                             |
| `force`                | `10`        | force multiplier                                                                                                          |
| `drawStyle`            | `'dots'`    | `dots` `glow` `trail` `streak` `links` `mono` `speedGlow` `crowdGlow`, or an array per type (repeats)                     |
| `scheme`               | `'rainbow'` | `rainbow` `neon` `okabeIto` `ocean` `fire` `gray` `paper`, or a `ColorScheme` object                                      |
| `colors`               | scheme      | one CSS color per type (repeats), overriding the scheme colors. Attribute: space-separated                                |
| `background`           | scheme bg   | any CSS color, or `'transparent'`. A light `#hex` switches glow to normal blending                                        |
| `fps`                  | `30`        | simulation (and redraw) rate. 60 for smoother motion, at twice the CPU                                                    |
| `maxPixelRatio`        | `2`         | caps canvas resolution on high-DPI screens                                                                                |
| `paused`               | `false`     |                                                                                                                           |
| `pauseWhenHidden`      | `true`      | stops while off-screen or the tab is hidden                                                                               |
| `respectReducedMotion` | `true`      | with `prefers-reduced-motion: reduce`, renders a single still frame                                                       |

## Demo

```
$ pnpm build && npx serve .
# /examples/              playground: options, matrix editor, code output, previews per screen format with load estimates
# /examples/element.html  the web component in plain HTML
```

## License

MIT © [anozon](https://anozon.me)
