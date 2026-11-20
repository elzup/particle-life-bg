// プレビュー用 iframe を「実寸で描いて縮小表示」する。
// 親で transform するとライブラリが測る getBoundingClientRect も縮むので、実寸の世界は iframe の中に閉じ込める

/**
 * @param {HTMLElement} stage
 * @param {(preview: any) => void} onReady
 */
export const createStage = (stage, onReady) => {
  const frame = document.createElement('iframe')
  const holder = document.createElement('div')
  let format = null

  frame.src = './preview.html'
  frame.title = 'preview'
  holder.className = 'frame-holder'
  holder.append(frame)
  stage.append(holder)

  const layout = () => {
    const box = stage.getBoundingClientRect()
    if (format === null) {
      Object.assign(frame.style, {
        width: '100%',
        height: '100%',
        transform: 'none',
      })
      Object.assign(holder.style, { width: '100%', height: '100%' })
      return
    }
    // 拡大はしない (実寸より大きく見せると点の粗さを誤解する)
    const scale = Math.min(
      1,
      box.width / format.width,
      box.height / format.height
    )
    Object.assign(frame.style, {
      width: `${format.width}px`,
      height: `${format.height}px`,
      transform: `scale(${scale})`,
    })
    Object.assign(holder.style, {
      width: `${format.width * scale}px`,
      height: `${format.height * scale}px`,
    })
    stage.dataset.scale = `${Math.round(scale * 100)}%`
  }

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.data?.type !== 'preview-ready')
      return
    onReady(frame.contentWindow.preview)
  })
  new ResizeObserver(layout).observe(stage)

  return {
    /** null なら stage いっぱい */
    setFormat: (next) => {
      format = next
      if (next === null) delete stage.dataset.scale
      layout()
    },
  }
}
