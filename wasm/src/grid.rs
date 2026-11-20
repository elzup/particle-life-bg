//! rMax 以上の大きさのセルに粒子を振り分ける (counting sort)。src/sim.ts の buildGrid / neighborTable と同じ分け方

use crate::State;

/// どちらかの軸のセル数が 3 未満だと 3×3 近傍が同じセルを重複して数えるので、全探索に切り替える
const MIN_GRID_SIZE: usize = 3;

/// step ごとに作り直す作業領域。毎回確保すると割り当てが計測に混ざるので使い回す
pub struct Scratch {
    pub cell_of: Vec<u32>,
    pub start: Vec<u32>,
    pub items: Vec<u32>,
    pub fill: Vec<u32>,
    pub neighbors: Vec<u32>,
    pub neighbors_per_cell: usize,
    pub ax: Vec<f32>,
    pub ay: Vec<f32>,
    pub sx: usize,
    pub sy: usize,
    pub cell_w: f32,
}

impl Scratch {
    pub fn new(count: usize) -> Self {
        Self {
            cell_of: vec![0; count],
            start: Vec::new(),
            items: vec![0; count],
            fill: Vec::new(),
            neighbors: Vec::new(),
            neighbors_per_cell: 0,
            ax: vec![0.0; count],
            ay: vec![0.0; count],
            sx: 0,
            sy: 0,
            cell_w: 1.0,
        }
    }
}

#[inline(always)]
pub fn cell_index(g: &Scratch, x: f32, y: f32) -> usize {
    let cx = ((x / g.cell_w) as usize).min(g.sx - 1);
    let cy = ((y * g.sy as f32) as usize).min(g.sy - 1);
    cy * g.sx + cx
}

fn build_neighbors(g: &mut Scratch) {
    let (sx, sy) = (g.sx, g.sy);
    let cells = sx * sy;
    // 大きさが変わらない限り作り直さない (rMax と幅が同じなら毎回同じ表になる)
    let per = if sx < MIN_GRID_SIZE || sy < MIN_GRID_SIZE { cells } else { 9 };
    if g.neighbors.len() == cells * per && g.neighbors_per_cell == per {
        return;
    }
    g.neighbors.clear();
    g.neighbors_per_cell = per;
    for c in 0..cells {
        if per == cells {
            g.neighbors.extend(0..cells as u32);
            continue;
        }
        let (cx, cy) = (c % sx, c / sx);
        for dy in [sy - 1, 0, 1] {
            for dx in [sx - 1, 0, 1] {
                let nx = (cx + dx) % sx;
                let ny = (cy + dy) % sy;
                g.neighbors.push((ny * sx + nx) as u32);
            }
        }
    }
}

pub fn build(s: &mut State, r_max: f32) {
    let width = s.width;
    let g = &mut s.scratch;
    let sx = ((width / r_max) as usize).max(1);
    let sy = ((1.0 / r_max) as usize).max(1);
    if sx != g.sx || sy != g.sy {
        g.neighbors.clear();
    }
    g.sx = sx;
    g.sy = sy;
    g.cell_w = width / sx as f32;
    let cells = sx * sy;
    g.start.clear();
    g.start.resize(cells + 1, 0);
    for i in 0..s.count {
        let c = cell_index(g, s.x[i], s.y[i]);
        g.cell_of[i] = c as u32;
        g.start[c + 1] += 1;
    }
    for c in 0..cells {
        g.start[c + 1] += g.start[c];
    }
    g.fill.clear();
    g.fill.extend_from_slice(&g.start[..cells]);
    for i in 0..s.count {
        let c = g.cell_of[i] as usize;
        g.items[g.fill[c] as usize] = i as u32;
        g.fill[c] += 1;
    }
    build_neighbors(g);
}
