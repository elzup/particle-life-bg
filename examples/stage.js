// プレビュー用 iframe を「実寸で描いて縮小表示」する。
// 親で transform するとライブラリが測る getBoundingClientRect も縮むので、実寸の世界は iframe の中に閉じ込める

// 端末の枠 (box-shadow で外側に描く) がはみ出して切れないよう、stage の内側に空ける余白
const BEZEL_PAD_PX = 14

const screensOf = (format) => format?.screens ?? 1

/**
 * contain = ページ全体 (スクロールぶん込み) を stage に収める。
 * cover = 最初の 1 画面ぶんを stage に合わせて大きく見せ、残りは stage のスクロールで見る。
 * どちらも実寸より拡大はしない (大きく見せると点の粗さを誤解する)
 */
const scaleFor = (format, fit, box) => {
  const width = box.width - BEZEL_PAD_PX * 2
  const height = box.height - BEZEL_PAD_PX * 2
  if (fit === 'cover') {
    const screenHeight = format.height / screensOf(format)
    // 横は切らない (端末の幅がはみ出すと別の画面に見える)。縦だけ 1 画面に合わせ、続きをスクロールに回す
    return Math.min(1, width / format.width, height / screenHeight)
  }
  return Math.min(1, width / format.width, height / format.height)
}

/**
 * @param {HTMLElement} stage
 * @param {(preview: any) => void} onReady
 * @param {{ foldLabel: string }} labels
 */
export const createStage = (stage, onReady, labels) => {
  const frame = document.createElement('iframe')
  const holder = document.createElement('div')
  // 実寸の iframe を縮小後の大きさで切り抜く。枠 (screen) は切り抜きの外に描くので別の箱にする
  const clip = document.createElement('div')
  const screen = document.createElement('div')
  const fold = document.createElement('div')
  let format = null
  let fit = 'contain'

  frame.src = './preview.html'
  frame.title = 'preview'
  holder.className = 'frame-holder'
  clip.className = 'frame-clip'
  screen.className = 'device-screen'
  fold.className = 'device-fold'
  fold.dataset.label = labels.foldLabel
  clip.append(frame)
  holder.append(clip, fold, screen)
  stage.append(holder)

  // preview 側の見出しを最初の 1 画面に置くため、何画面ぶんの高さかを伝える
  const syncScreens = () => {
    frame.contentDocument?.documentElement.style.setProperty(
      '--screens',
      String(screensOf(format))
    )
  }
  frame.addEventListener('load', syncScreens)

  const layoutFill = () => {
    Object.assign(frame.style, {
      width: '100%',
      height: '100%',
      transform: 'none',
    })
    Object.assign(holder.style, { width: '100%', height: '100%' })
    screen.hidden = true
    fold.hidden = true
    delete stage.dataset.scale
    delete stage.dataset.fit
  }

  const layout = () => {
    syncScreens()
    if (format === null) return layoutFill()
    const scale = scaleFor(format, fit, stage.getBoundingClientRect())
    const screenHeight = (format.height / screensOf(format)) * scale
    Object.assign(frame.style, {
      width: `${format.width}px`,
      height: `${format.height}px`,
      transform: `scale(${scale})`,
    })
    Object.assign(holder.style, {
      width: `${format.width * scale}px`,
      height: `${format.height * scale}px`,
    })
    screen.hidden = false
    screen.style.height = `${screenHeight}px`
    screen.dataset.device = format.id
    fold.hidden = screensOf(format) <= 1
    fold.style.top = `${screenHeight}px`
    stage.dataset.scale = `${Math.round(scale * 100)}%`
    stage.dataset.fit = fit
  }

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.data?.type !== 'preview-ready')
      return
    syncScreens()
    onReady(frame.contentWindow.preview)
  })
  new ResizeObserver(layout).observe(stage)

  return {
    /** null なら stage いっぱい */
    setFormat: (next) => {
      format = next
      layout()
    },
    /** @param {'contain' | 'cover'} next */
    setFit: (next) => {
      fit = next
      stage.scrollTo({ top: 0 })
      layout()
    },
  }
}
