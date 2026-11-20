//! SIMD 無しの素直な移植。src/sim.ts の accumulate / step と同じ手順で、言語の違いだけを比べるため

use crate::{State, force, grid, integrate, wrap_delta};

pub fn step(s: &mut State, r_max: f32, friction_half_life: f32, force_factor: f32, dt: f32) {
    grid::build(s, r_max);
    let r2_max = r_max * r_max;
    let n = s.type_count;
    let per = s.scratch.neighbors_per_cell;

    // 全員の力を出してから動かす (順に動かすと先に動いた粒子の位置で後続の力が歪む)
    for i in 0..s.count {
        let (xi, yi) = (s.x[i], s.y[i]);
        let row = s.types[i] as usize * n;
        let c = grid::cell_index(&s.scratch, xi, yi);
        let (mut fx, mut fy, mut near) = (0.0f32, 0.0f32, 0u16);
        for &nc in &s.scratch.neighbors[c * per..(c + 1) * per] {
            let nc = nc as usize;
            for k in s.scratch.start[nc]..s.scratch.start[nc + 1] {
                let j = s.scratch.items[k as usize] as usize;
                let dx = wrap_delta(s.x[j] - xi, s.width);
                let dy = wrap_delta(s.y[j] - yi, 1.0);
                let d2 = dx * dx + dy * dy;
                // j == i は d2 == 0 で弾かれる
                if d2 == 0.0 || d2 >= r2_max {
                    continue;
                }
                let dist = d2.sqrt();
                let f = force(dist / r_max, s.matrix[row + s.types[j] as usize]);
                fx += dx / dist * f;
                fy += dy / dist * f;
                near += 1;
            }
        }
        s.scratch.ax[i] = fx * r_max * force_factor;
        s.scratch.ay[i] = fy * r_max * force_factor;
        s.near[i] = near;
    }
    let (ax, ay) = (
        core::mem::take(&mut s.scratch.ax),
        core::mem::take(&mut s.scratch.ay),
    );
    integrate(s, &ax, &ay, friction_half_life, dt);
    s.scratch.ax = ax;
    s.scratch.ay = ay;
}
