// lib/wasm/sim-simd.wasm を base64 にして src/wasm-simd.gen.ts に書く (pnpm build:wasm の最後に走る)。
// 生成物はコミットする: publish する CI には Rust が無く、利用者の bundler に .wasm の設定を求めないため
import { readFile, writeFile } from 'node:fs/promises'

const src = new URL('../lib/wasm/sim-simd.wasm', import.meta.url)
const out = new URL('../src/wasm-simd.gen.ts', import.meta.url)

const bytes = await readFile(src)
const code = [
  '// 生成ファイル。手で編集しない (pnpm build:wasm が scripts/embed-wasm.ts で書き出す)',
  '// 型を string と明示するのは、推論させると d.ts に base64 全体がリテラル型で入るため',
  '// wasm/src の simd128 ビルドを base64 にしたもの。src/wasm.ts が dynamic import で読む',
  // biome の整形結果と同じ形で書く (pnpm check で差分を出さないため)
  'export const SIM_SIMD_WASM: string =',
  `  '${bytes.toString('base64')}'`,
  '',
].join('\n')

await writeFile(out, code)
console.log(`src/wasm-simd.gen.ts を書いた (${bytes.length} bytes)`)
