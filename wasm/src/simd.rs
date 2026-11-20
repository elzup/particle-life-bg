//! simd128 版。粒子をセル順に並べ替えた写しを作り、近傍セルの中身を 4 粒子ずつまとめて計算する。
//! 並べ替えないと 4 粒子ぶんの座標がメモリ上で離れていて、1 本ずつ集めるコストで SIMD の得が消える

use core::arch::wasm32::*;

use crate::{BETA, State, force, grid, integrate, wrap_delta};

const LANES: usize = 4;

#[derive(Default)]
struct Sorted {
    x: Vec<f32>,
    y: Vec<f32>,
    t: Vec<u8>,
}

fn sort_by_cell(s: &State, out: &mut Sorted) {
    let items = &s.scratch.items;
    out.x.clear();
    out.y.clear();
    out.t.clear();
    out.x.extend(items.iter().map(|&i| s.x[i as usize]));
    out.y.extend(items.iter().map(|&i| s.y[i as usize]));
    out.t.extend(items.iter().map(|&i| s.types[i as usize]));
}

/// トーラス上の最短差分を 4 レーン同時に。比較結果のマスク (全ビット 1/0) で周期を足し引きする
#[inline(always)]
fn wrap4(d: v128, period: v128, half: v128, neg_half: v128) -> v128 {
    let over = v128_and(f32x4_gt(d, half), period);
    let under = v128_and(f32x4_lt(d, neg_half), period);
    f32x4_add(f32x4_sub(d, over), under)
}

struct Lanes {
    width: v128,
    half_w: v128,
    neg_half_w: v128,
    one: v128,
    half_1: v128,
    neg_half_1: v128,
    zero: v128,
    r2_max: v128,
    inv_r_max: v128,
    inv_beta: v128,
    beta: v128,
    tri_k: v128,
    one_plus_beta: v128,
    two: v128,
}

impl Lanes {
    fn new(width: f32, r_max: f32) -> Self {
        Self {
            width: f32x4_splat(width),
            half_w: f32x4_splat(width * 0.5),
            neg_half_w: f32x4_splat(-width * 0.5),
            one: f32x4_splat(1.0),
            half_1: f32x4_splat(0.5),
            neg_half_1: f32x4_splat(-0.5),
            zero: f32x4_splat(0.0),
            r2_max: f32x4_splat(r_max * r_max),
            inv_r_max: f32x4_splat(1.0 / r_max),
            inv_beta: f32x4_splat(1.0 / BETA),
            beta: f32x4_splat(BETA),
            tri_k: f32x4_splat(1.0 / (1.0 - BETA)),
            one_plus_beta: f32x4_splat(1.0 + BETA),
            two: f32x4_splat(2.0),
        }
    }
}

/// 粒子 (xi, yi, row) が並べ替え済みの [from, to) から受ける力を足す。端数は 1 粒子ずつ
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn accumulate_range(
    s: &State,
    sorted: &Sorted,
    l: &Lanes,
    (xi, yi, row): (f32, f32, usize),
    from: usize,
    to: usize,
    acc: &mut (v128, v128, v128),
    tail: &mut (f32, f32, u16),
) {
    let (vxi, vyi) = (f32x4_splat(xi), f32x4_splat(yi));
    let m = &s.matrix;
    let mut j = from;
    while j + LANES <= to {
        let px = unsafe { v128_load(sorted.x.as_ptr().add(j) as *const v128) };
        let py = unsafe { v128_load(sorted.y.as_ptr().add(j) as *const v128) };
        let t = &sorted.t[j..j + LANES];
        // 種類ごとの係数は表引きなので、4 つを個別に読んで束ねる
        let a = f32x4(
            m[row + t[0] as usize],
            m[row + t[1] as usize],
            m[row + t[2] as usize],
            m[row + t[3] as usize],
        );
        let dx = wrap4(f32x4_sub(px, vxi), l.width, l.half_w, l.neg_half_w);
        let dy = wrap4(f32x4_sub(py, vyi), l.one, l.half_1, l.neg_half_1);
        let d2 = f32x4_add(f32x4_mul(dx, dx), f32x4_mul(dy, dy));
        let valid = v128_and(f32x4_gt(d2, l.zero), f32x4_lt(d2, l.r2_max));
        let dist = f32x4_sqrt(d2);
        let r = f32x4_mul(dist, l.inv_r_max);
        let repel = f32x4_sub(f32x4_mul(r, l.inv_beta), l.one);
        let peak = f32x4_abs(f32x4_sub(f32x4_mul(l.two, r), l.one_plus_beta));
        let attract = f32x4_mul(a, f32x4_sub(l.one, f32x4_mul(peak, l.tri_k)));
        let f = v128_bitselect(repel, attract, f32x4_lt(r, l.beta));
        // dist = 0 のレーンは割り算で NaN になるので、足す前に valid で 0 に落とす
        let k = v128_and(f32x4_div(f, dist), valid);
        acc.0 = f32x4_add(acc.0, f32x4_mul(dx, k));
        acc.1 = f32x4_add(acc.1, f32x4_mul(dy, k));
        // 比較のマスクは真が -1 (全ビット 1) なので、引くと件数が 1 ずつ増える
        acc.2 = i32x4_sub(acc.2, valid);
        j += LANES;
    }
    while j < to {
        let dx = wrap_delta(sorted.x[j] - xi, s.width);
        let dy = wrap_delta(sorted.y[j] - yi, 1.0);
        let d2 = dx * dx + dy * dy;
        let r2_max = f32x4_extract_lane::<0>(l.r2_max);
        if d2 > 0.0 && d2 < r2_max {
            let dist = d2.sqrt();
            let r = dist * f32x4_extract_lane::<0>(l.inv_r_max);
            let f = force(r, m[row + sorted.t[j] as usize]);
            tail.0 += dx / dist * f;
            tail.1 += dy / dist * f;
            tail.2 += 1;
        }
        j += 1;
    }
}

#[inline(always)]
fn hsum(v: v128) -> f32 {
    f32x4_extract_lane::<0>(v)
        + f32x4_extract_lane::<1>(v)
        + f32x4_extract_lane::<2>(v)
        + f32x4_extract_lane::<3>(v)
}

#[inline(always)]
fn hsum_i(v: v128) -> i32 {
    i32x4_extract_lane::<0>(v)
        + i32x4_extract_lane::<1>(v)
        + i32x4_extract_lane::<2>(v)
        + i32x4_extract_lane::<3>(v)
}

static mut SORTED: Option<Sorted> = None;

#[allow(static_mut_refs)]
pub fn step(s: &mut State, r_max: f32, friction_half_life: f32, force_factor: f32, dt: f32) {
    grid::build(s, r_max);
    let sorted = unsafe { SORTED.get_or_insert_with(Sorted::default) };
    sort_by_cell(s, sorted);
    let l = Lanes::new(s.width, r_max);
    let n = s.type_count;
    let per = s.scratch.neighbors_per_cell;
    let mut ax = core::mem::take(&mut s.scratch.ax);
    let mut ay = core::mem::take(&mut s.scratch.ay);

    for i in 0..s.count {
        let (xi, yi) = (s.x[i], s.y[i]);
        let me = (xi, yi, s.types[i] as usize * n);
        let c = grid::cell_index(&s.scratch, xi, yi);
        let mut acc = (l.zero, l.zero, i32x4_splat(0));
        let mut tail = (0.0f32, 0.0f32, 0u16);
        for &nc in &s.scratch.neighbors[c * per..(c + 1) * per] {
            let nc = nc as usize;
            let (from, to) = (s.scratch.start[nc] as usize, s.scratch.start[nc + 1] as usize);
            accumulate_range(s, sorted, &l, me, from, to, &mut acc, &mut tail);
        }
        let fx = hsum(acc.0) + tail.0;
        let fy = hsum(acc.1) + tail.1;
        ax[i] = fx * r_max * force_factor;
        ay[i] = fy * r_max * force_factor;
        s.near[i] = hsum_i(acc.2) as u16 + tail.2;
    }
    integrate(s, &ax, &ay, friction_half_life, dt);
    s.scratch.ax = ax;
    s.scratch.ay = ay;
}
