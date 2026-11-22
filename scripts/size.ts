// 利用者のバンドルに乗るサイズを測り、README のバッジと表を書き換える (bundlephobia と同じ手法を手元で)。
// tarball や unpackedSize は ESM + CJS + 型を全部含むので、bundler が実際に引く ESM を minify + 圧縮して測る。
// 先に pnpm build で lib/ を作っておく。`--check` は README が古ければ失敗する (CI 用)
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { build, type Plugin } from 'esbuild'

type Entry = {
  label: string
  code: string
  note: string
  isLazyChunk?: boolean
}

// 利用者が書く import をそのまま入口にする。tree-shaking 後の実際の重さが分かるよう mount だけの場合も測る
const ENTRIES: Entry[] = [
  {
    label: '`mount` only',
    code: `import { mount } from './lib/esm/index.js'; mount(document.body)`,
    note: 'typical vanilla usage after tree-shaking',
  },
  {
    label: '`particle-life-bg`',
    code: `export * from './lib/esm/index.js'`,
    note: 'everything exported from the main entry',
  },
  {
    label: '`particle-life-bg/element`',
    code: `import './lib/esm/element.js'`,
    note: 'registers `<particle-life-bg>`',
  },
  {
    label: '`particle-life-bg/react`',
    code: `export * from './lib/esm/react.js'`,
    note: 'excluding react itself',
  },
  {
    label: 'WASM SIMD chunk',
    code: `export * from './lib/esm/wasm-simd.gen.js'`,
    note: 'fetched after the first frame via dynamic import (skipped with `engine: "js"`)',
    isLazyChunk: true,
  },
]

const README = new URL('../readme.md', import.meta.url)
const ROOT = new URL('..', import.meta.url).pathname
const START = '<!-- size:start -->'
const END = '<!-- size:end -->'
const BADGE_RE = /!\[min\+gzip\]\([^)]*\)/

// bundler は dynamic import を別 chunk に分けるので、入口の重さからは wasm を外し、別の行で測る
const lazyWasm: Plugin = {
  name: 'lazy-wasm',
  setup: (b) => {
    b.onResolve({ filter: /wasm-simd\.gen\.js$/ }, (args) => ({
      path: args.path,
      external: true,
    }))
  },
}

const measure = async (entry: Entry) => {
  const result = await build({
    stdin: { contents: entry.code, resolveDir: ROOT, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    external: ['react'],
    write: false,
    logLevel: 'error',
    plugins: entry.isLazyChunk ? [] : [lazyWasm],
  })
  const bytes = result.outputFiles[0].contents
  return {
    ...entry,
    min: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes).length,
  }
}

const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`

const table = (rows: Awaited<ReturnType<typeof measure>>[]) =>
  [
    '| import | min | min + gzip | min + brotli | |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map(
      (r) =>
        `| ${r.label} | ${kb(r.min)} | ${kb(r.gzip)} | ${kb(r.brotli)} | ${r.note} |`
    ),
  ].join('\n')

const badge = (gzip: number) =>
  `![min+gzip](https://img.shields.io/badge/min%2Bgzip-${encodeURIComponent(kb(gzip))}-informational)`

const rows = await Promise.all(ENTRIES.map(measure))
const main = rows.find((r) => r.label === '`particle-life-bg`')
if (main === undefined) throw new Error('size: main entry が測れていない')

const readme = await readFile(README, 'utf8')
const start = readme.indexOf(START)
const end = readme.indexOf(END)
if (start < 0 || end < start)
  throw new Error(`size: readme.md に ${START} 〜 ${END} が無い`)
if (!BADGE_RE.test(readme))
  throw new Error('size: readme.md に ![min+gzip](...) のバッジが無い')

// readme.md も biome の整形対象 (表の桁揃え) なので、同じ整形を通してから比べる
const formatMarkdown = (text: string) => {
  const res = spawnSync(
    'pnpm',
    ['exec', 'biome', 'format', '--stdin-file-path=readme.md'],
    {
      cwd: ROOT,
      input: text,
      encoding: 'utf8',
    }
  )
  if (res.status !== 0)
    throw new Error(`size: biome format に失敗した: ${res.stderr}`)
  return res.stdout
}

const unformatted =
  `${readme.slice(0, start + START.length)}\n${table(rows)}\n${readme.slice(end)}`.replace(
    BADGE_RE,
    badge(main.gzip)
  )
const next = formatMarkdown(unformatted)

console.log(table(rows))
if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error(
      'size: readme.md のサイズ表が古い。pnpm build && pnpm size で更新する'
    )
    process.exit(1)
  }
} else if (next !== readme) {
  await writeFile(README, next)
  console.log('readme.md を更新した')
}
