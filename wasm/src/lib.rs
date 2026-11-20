//! Particle Life の計算部分 (src/sim.ts の step と同じ式) を WASM にしたもの。比較ベンチ用。
//!
//! wasm-bindgen を使わず素の extern "C" で出す。JS 側は WASM のメモリ上の配列を
//! Float32Array として直接読み書きする (粒子ごとの受け渡しをすると呼び出しの往復で JS より遅くなる)。
//!
//! 同じソースを 2 通りにビルドする:
//! - sim.wasm: SIMD 無し。JS 版と同じく「セルの添字 → 粒子番号」と間接参照する素直な移植
//! - sim-simd.wasm: `-C target-feature=+simd128`。粒子をセル順に並べ替えた写しを作り、4 粒子ずつ計算する

mod grid;
#[cfg(not(target_feature = "simd128"))]
mod scalar;
#[cfg(target_feature = "simd128")]
mod simd;

/// 粒子の状態。JS の World と同じ並び (構造体の配列ではなく配列の構造体) にして、JS から型付き配列で見られるようにする
pub struct State {
    pub count: usize,
    pub width: f32,
    pub types: Vec<u8>,
    pub x: Vec<f32>,
    pub y: Vec<f32>,
    pub vx: Vec<f32>,
    pub vy: Vec<f32>,
    pub near: Vec<u16>,
    pub matrix: Vec<f32>,
    pub type_count: usize,
    pub scratch: grid::Scratch,
}

// WASM は単一スレッドで、JS からの呼び出しも 1 本ずつなので、状態はモジュールに 1 つだけ持つ
static mut STATE: Option<State> = None;

#[allow(static_mut_refs)]
fn state() -> &'static mut State {
    unsafe { STATE.as_mut().expect("init を先に呼ぶ") }
}

/// 粒子数・種類数・空間の幅で配列を確保し直す。位置などの中身は JS 側が書き込む
#[unsafe(no_mangle)]
pub extern "C" fn init(count: usize, type_count: usize, width: f32) {
    let zeros = || vec![0.0f32; count];
    let types = vec![0u8; count];
    let near = vec![0u16; count];
    let matrix = vec![0.0f32; type_count * type_count];
    unsafe {
        STATE = Some(State {
            count,
            width,
            types,
            x: zeros(),
            y: zeros(),
            vx: zeros(),
            vy: zeros(),
            near,
            matrix,
            type_count,
            scratch: grid::Scratch::new(count),
        });
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn ptr_types() -> *mut u8 {
    state().types.as_mut_ptr()
}
#[unsafe(no_mangle)]
pub extern "C" fn ptr_x() -> *mut f32 {
    state().x.as_mut_ptr()
}
#[unsafe(no_mangle)]
pub extern "C" fn ptr_y() -> *mut f32 {
    state().y.as_mut_ptr()
}
#[unsafe(no_mangle)]
pub extern "C" fn ptr_vx() -> *mut f32 {
    state().vx.as_mut_ptr()
}
#[unsafe(no_mangle)]
pub extern "C" fn ptr_vy() -> *mut f32 {
    state().vy.as_mut_ptr()
}
#[unsafe(no_mangle)]
pub extern "C" fn ptr_near() -> *mut u16 {
    state().near.as_mut_ptr()
}
#[unsafe(no_mangle)]
pub extern "C" fn ptr_matrix() -> *mut f32 {
    state().matrix.as_mut_ptr()
}

/// dt 秒ぶん進める。式と引数の意味は src/sim.ts の step と同じ
#[unsafe(no_mangle)]
pub extern "C" fn step(r_max: f32, friction_half_life: f32, force_factor: f32, dt: f32) {
    let s = state();
    #[cfg(not(target_feature = "simd128"))]
    scalar::step(s, r_max, friction_half_life, force_factor, dt);
    #[cfg(target_feature = "simd128")]
    simd::step(s, r_max, friction_half_life, force_factor, dt);
}

/// JS 側が「どちらのビルドを読んだか」を確かめるため
#[unsafe(no_mangle)]
pub extern "C" fn is_simd() -> u32 {
    cfg!(target_feature = "simd128") as u32
}

// ---- JS 版と共通の式 ----

/// これより近いと種類に関係なく反発する (rMax 比)。src/sim.ts の BETA と同じ値
pub const BETA: f32 = 0.3;

#[inline(always)]
pub fn force(r: f32, a: f32) -> f32 {
    if r < BETA {
        r / BETA - 1.0
    } else if r < 1.0 {
        a * (1.0 - (2.0 * r - 1.0 - BETA).abs() / (1.0 - BETA))
    } else {
        0.0
    }
}

#[inline(always)]
pub fn wrap_delta(d: f32, period: f32) -> f32 {
    let half = period * 0.5;
    if d > half {
        d - period
    } else if d < -half {
        d + period
    } else {
        d
    }
}

#[inline(always)]
pub fn wrap(v: f32, period: f32) -> f32 {
    v - (v / period).floor() * period
}

#[inline(always)]
pub fn integrate(s: &mut State, ax: &[f32], ay: &[f32], friction_half_life: f32, dt: f32) {
    let damping = 0.5f32.powf(dt / friction_half_life);
    for i in 0..s.count {
        let vx = s.vx[i] * damping + ax[i] * dt;
        let vy = s.vy[i] * damping + ay[i] * dt;
        s.vx[i] = vx;
        s.vy[i] = vy;
        s.x[i] = wrap(s.x[i] + vx * dt, s.width);
        s.y[i] = wrap(s.y[i] + vy * dt, 1.0);
    }
}

