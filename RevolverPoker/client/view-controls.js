export const OVERVIEW_LIMITS = { yaw: .10, pitch: .055 };
export const TURN_FOLLOW = { resumeDelay: 1000, duration: 1000, accelerationEnd: .6 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapAngle = value => ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
// The slope decreases toward the edge, rather than hitting an abrupt stop.
export const overviewResponse = value => Math.tanh(clamp(value, -1, 1) * 1.6) / Math.tanh(1.6);

export class SceneViewControls {
  constructor(scene, canvas, doc = document, win = window, now = () => performance.now()) {
    this.scene = scene; this.canvas = canvas; this.doc = doc; this.win = win;
    this.now = now; this.followAfter = 0; this.turnFollow = null; this.focused = doc.hasFocus?.() ?? true;
    this.drag = null; this.input = { x: 0, y: 0 };
    this.offset = { yaw: 0, pitch: 0 }; this.listeners = [];
    const listen = (target, type, fn) => { target.addEventListener(type, fn); this.listeners.push(() => target.removeEventListener(type, fn)); };
    listen(canvas, 'pointerdown', e => this.down(e));
    listen(canvas, 'pointermove', e => this.move(e));
    listen(canvas, 'pointerup', e => this.up(e));
    listen(canvas, 'pointercancel', () => this.cancel());
    listen(canvas, 'lostpointercapture', () => this.cancel());
    listen(canvas, 'pointerleave', () => { if (!this.drag) this.input = { x: 0, y: 0 }; });
    listen(canvas, 'keydown', e => this.key(e));
    listen(win, 'blur', () => { this.focused = false; this.cancel(); this.pauseTurnFollow(); this.input = { x: 0, y: 0 }; });
    listen(win, 'focus', () => { this.focused = true; this.pauseTurnFollow(); });
    listen(doc, 'visibilitychange', () => {
      this.pauseTurnFollow();
      if (doc.hidden) { this.cancel(); this.input = { x: 0, y: 0 }; }
    });
  }
  get blocked() { return !this.focused || this.doc.hidden || !!this.doc.querySelector('dialog[open]'); }
  pauseTurnFollow() { this.followAfter = this.now() + TURN_FOLLOW.resumeDelay; this.turnFollow = null; }
  resumeTurnFollow() { this.followAfter = 0; this.turnFollow = null; }
  reset() {
    this.cancel(); this.input = { x: 0, y: 0 }; this.offset = { yaw: 0, pitch: 0 };
    this.pauseTurnFollow();
  }
  down(e) {
    if (!e.isPrimary || e.button !== 0 || this.blocked) return;
    this.pauseTurnFollow();
    this.scene.viewTransition = null;
    this.canvas.focus({ preventScroll: true });
    const target = this.scene.hitTarget(e.clientX, e.clientY);
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, distance: 0, moved: false, target };
    this.drag.tableGesture = this.scene.tableActions?.begin(target, { x: e.clientX, y: e.clientY }, this.now()) ?? false;
    if (target?.cardRole) this.drag.peek = this.scene.beginCardPeek(target.cardRole);
    this.canvas.setPointerCapture(e.pointerId);
  }
  trackDrag(dx, dy) {
    if (!this.drag) return;
    this.drag.distance += Math.hypot(dx, dy);
    this.drag.moved ||= this.drag.distance > 6;
  }
  move(e) {
    if (this.blocked) { this.cancel(); return; }
    const drag = this.drag?.id === e.pointerId ? this.drag : null;
    if (!drag) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { this.cancel(); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    this.trackDrag(dx, dy); drag.x = e.clientX; drag.y = e.clientY;
    if (drag.tableGesture && this.scene.tableActions.move({ x: e.clientX, y: e.clientY }, this.now())) return;
    if (this.scene.peekActive || drag.peek || !drag.moved) return;
    if (this.scene.firstPerson) this.turn(dx, dy);
    else this.nudgeOverview(dx / 250, dy / 250);
  }
  up(e) {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.id) return;
    // Check release distance too, including a pointer that moved outside the canvas.
    drag.moved ||= Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6;
    if (drag.tableGesture) {
      this.scene.tableActions.release({ x: e.clientX, y: e.clientY }, this.now());
      drag.tableGesture = false;
      // Surface taps belong to checking, and prop gestures must never pick a seat.
      drag.moved = true;
    }
    this.cancel();
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (drag.peek || drag.moved || this.blocked) return;
    if (Number.isInteger(drag.target?.seat)) this.scene.pickSeat(e.clientX, e.clientY);
  }
  cancel() {
    const drag = this.drag; this.drag = null;
    if (drag) this.pauseTurnFollow();
    if (drag?.tableGesture) this.scene.tableActions?.cancel();
    if (drag?.peek) this.scene.endCardPeek();
    if (drag && this.canvas.hasPointerCapture(drag.id)) this.canvas.releasePointerCapture(drag.id);
  }
  turn(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.pauseTurnFollow();
    this.scene.yaw = wrapAngle(this.scene.yaw - dx * .0028);
    this.scene.pitch = clamp(this.scene.pitch - dy * .0023, -1.35, 1.35);
    this.scene.applyView();
  }
  nudgeOverview(x, y) { this.input.x = clamp(this.input.x + x, -1, 1); this.input.y = clamp(this.input.y + y, -1, 1); }
  key(e) {
    if (this.blocked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') { this.scene.resetView(); return; }
    const x = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const y = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (this.scene.firstPerson) this.turn(x * 35, y * 35);
    else this.nudgeOverview(x * .15, y * .15);
  }
  tick(seconds) {
    if (!this.blocked) this.scene.tableActions?.tick(this.now());
    if (this.scene.firstPerson) { this.followTurn(seconds); return; }
    this.turnFollow = null;
    if (this.blocked) this.input = { x: 0, y: 0 };
    const alpha = 1 - Math.exp(-9 * Math.min(seconds, .1));
    const yaw = -OVERVIEW_LIMITS.yaw * overviewResponse(this.input.x), pitch = -OVERVIEW_LIMITS.pitch * overviewResponse(this.input.y);
    this.offset.yaw += (yaw - this.offset.yaw) * alpha;
    this.offset.pitch += (pitch - this.offset.pitch) * alpha;
    this.scene.yaw = this.offset.yaw;
    this.scene.pitch = this.scene.overviewPitch + this.offset.pitch;
    this.scene.applyView();
  }
  followTurn(seconds) {
    if (this.blocked || this.drag || this.scene.peekActive || this.scene.cardPeekClosing || this.scene.viewTransition || this.now() < this.followAfter) {
      this.turnFollow = null; return;
    }
    const target = this.scene.getTurnLookTarget?.();
    if (!target || !Number.isFinite(target.yaw) || !Number.isFinite(target.pitch)) { this.turnFollow = null; return; }
    const now = this.now(), key = target.key ?? target;
    if (!this.turnFollow || this.turnFollow.key !== key) {
      this.turnFollow = { key, start: now - clamp(seconds, 0, .1) * 1000, yaw: this.scene.yaw, pitch: this.scene.pitch,
        position: target.position && this.scene.camera?.position.clone(), roll: this.scene.roll ?? 0 };
    }
    const follow = this.turnFollow, progress = clamp((now - follow.start) / TURN_FOLLOW.duration, 0, 1);
    // Accelerate until 60%, then brake to rest at the one-second deadline.
    // Both branches meet with the same position and speed at the peak.
    const peak = TURN_FOLLOW.accelerationEnd;
    const ease = progress < peak ? progress * progress / peak : 1 - (1 - progress) ** 2 / (1 - peak);
    this.scene.yaw = wrapAngle(follow.yaw + wrapAngle(target.yaw - follow.yaw) * ease);
    this.scene.pitch = clamp(follow.pitch + (clamp(target.pitch, -1.35, 1.35) - follow.pitch) * ease, -1.35, 1.35);
    if (follow.position && target.position) this.scene.camera.position.lerpVectors(follow.position, target.position, ease);
    if (Number.isFinite(target.roll)) this.scene.roll = follow.roll + wrapAngle(target.roll - follow.roll) * ease;
    this.scene.applyView();
  }
  dispose() { this.cancel(); this.listeners.forEach(remove => remove()); }
}
