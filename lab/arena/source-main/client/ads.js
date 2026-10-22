// Aim-down-sights controller. Produces an eased 0..1 value with a per-weapon ADS time. The viewmodel uses it to slide the weapon from its
// hip pose into a pose computed so the SIGHT POINT lies on the camera axis (real sight alignment, not just FOV/pushback).
export class ADS {
  constructor() { this.t = 0; this.e = 0; }
  update(dt, wantAim, w) {
    this.t += (wantAim ? 1 : -1) * dt / Math.max(0.05, w.adsTime);
    this.t = Math.max(0, Math.min(1, this.t));
    this.e = this.t * this.t * (3 - 2 * this.t);                 // smoothstep
    return this.e;
  }
  reset() { this.t = 0; this.e = 0; }
  fov(baseFov, w) { return baseFov + (w.adsFov * (baseFov / 75) - baseFov) * this.e; }
  get scoped() { return this.e > 0.92; }
}
export const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
