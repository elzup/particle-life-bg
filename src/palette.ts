// 粒子の配色。種類数 n が 2〜10 で変わるので、固定リストか n 等分の関数で色を出す

export type ColorScheme = {
  name: string
  bg: string
  /** モノトーン描画に使う色 (地に対して読める色) */
  fg: string
  /** 明るい地では加算合成が白飛びするので通常合成に切り替える */
  isLight: boolean
  color: (t: number, n: number) => string
}

const fromList =
  (list: string[]) =>
  (t: number): string =>
    list[t % list.length] ?? '#ffffff'

// t を 0〜1 に正規化して色相・明度を from→to へ補間する
const ramp =
  (h0: number, h1: number, s: number, l0: number, l1: number) =>
  (t: number, n: number): string => {
    const r = n <= 1 ? 0 : t / (n - 1)

    return `hsl(${h0 + (h1 - h0) * r}, ${s}%, ${l0 + (l1 - l0) * r}%)`
  }

export const COLOR_SCHEMES = {
  rainbow: {
    name: 'Rainbow',
    bg: '#0b0d12',
    fg: '#ffffff',
    isLight: false,
    color: (t: number, n: number) => `hsl(${(360 * t) / n}, 85%, 60%)`,
  },
  neon: {
    name: 'Neon',
    bg: '#05040a',
    fg: '#ffffff',
    isLight: false,
    color: fromList([
      '#ff2bd6',
      '#00f0ff',
      '#b6ff00',
      '#ff8a00',
      '#7a5cff',
      '#ff3d5a',
      '#00ff9c',
      '#ffe600',
      '#3d8bff',
      '#ff6ec7',
    ]),
  },
  // Okabe & Ito の色覚多様性に配慮した 8 色 + 補助 2 色
  okabeIto: {
    name: 'Okabe-Ito',
    bg: '#101216',
    fg: '#ffffff',
    isLight: false,
    color: fromList([
      '#E69F00',
      '#56B4E9',
      '#009E73',
      '#F0E442',
      '#0072B2',
      '#D55E00',
      '#CC79A7',
      '#F5F5F5',
      '#999999',
      '#8B5FBF',
    ]),
  },
  ocean: {
    name: 'Ocean',
    bg: '#04131c',
    fg: '#cfefff',
    isLight: false,
    color: ramp(160, 250, 75, 40, 75),
  },
  fire: {
    name: 'Fire',
    bg: '#120604',
    fg: '#ffe8d0',
    isLight: false,
    color: ramp(0, 55, 95, 42, 70),
  },
  gray: {
    name: 'Gray',
    bg: '#0b0d12',
    fg: '#ffffff',
    isLight: false,
    color: ramp(220, 220, 8, 35, 92),
  },
  paper: {
    name: 'Paper',
    bg: '#f3f4f6',
    fg: '#1a1d24',
    isLight: true,
    color: (t: number, n: number) => `hsl(${(360 * t) / n}, 70%, 40%)`,
  },
} satisfies Record<string, ColorScheme>

export type SchemeName = keyof typeof COLOR_SCHEMES

const WHITE: [number, number, number] = [255, 255, 255]

/** CSS の色文字列を r,g,b に直す (色の構文解析を自前で持たず canvas に解釈させる) */
export const toRgb = (
  g: CanvasRenderingContext2D,
  color: string
): [number, number, number] => {
  g.fillStyle = '#000'
  g.fillStyle = color
  const hex = String(g.fillStyle)

  // canvas は不透明色を #rrggbb で返す。それ以外 (透明度付き等) は光らせる色として白で代用する
  if (!hex.startsWith('#') || hex.length !== 7) return WHITE
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16)

  return [channel(1), channel(3), channel(5)]
}
