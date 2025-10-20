import { Injectable, NgZone } from "@angular/core";
import { Motion } from "@capacitor/motion";
import type { AccelListenerEvent } from "@capacitor/motion";
import type { PluginListenerHandle } from "@capacitor/core";

export type MotionBindings = {
  nextPhoto: () => void;
  prevPhoto: () => void;
  nextProduct: () => void;
  prevProduct: () => void;
  resetToFirst: () => void;
};

export type MotionOptions = {
  tiltThresholdDeg?: number;
  cooldownMs?: number;
  oscillationWindowMs?: number;
  oscillationMinToggles?: number;
  holdMs?: number;
  invertLR?: boolean;
};

@Injectable({ providedIn: "root" })
export class MotionControls {
  private accelHandle?: PluginListenerHandle;
  private lastFire: Record<string, number> = {};
  private toggles: number[] = [];
  private lastRollSign = 0;
  private lastHoldStart: Record<"L" | "R" | "F" | "B", number> = { L: 0, R: 0, F: 0, B: 0 };

  private opts: Required<MotionOptions> = {
    tiltThresholdDeg: 22,
    cooldownMs: 600,
    oscillationWindowMs: 1400,
    oscillationMinToggles: 4,
    holdMs: 200,
    invertLR: false
  };

  constructor(private zone: NgZone) { }

  async start(bind: MotionBindings, options?: MotionOptions): Promise<void> {
    this.opts = { ...this.opts, ...(options || {}) };
    this.stop();

    this.accelHandle = await Motion.addListener("accel", (e: AccelListenerEvent) => {
      const ag = e.accelerationIncludingGravity ?? e.acceleration;
      if (!ag) return;

      const rollDeg = Math.atan2(ag.y ?? 0, ag.z ?? 0) * (180 / Math.PI);
      const pitchDeg = Math.atan2(-(ag.x ?? 0), Math.hypot(ag.y ?? 0, ag.z ?? 0)) * (180 / Math.PI);

      const now = Date.now();
      const th = this.opts.tiltThresholdDeg;

      if (!this.opts.invertLR) {
        if (rollDeg <= -th) this.markHold("L", now, () => this.call(bind.nextPhoto, "nextPhoto", now));
        else this.lastHoldStart.L = 0;
        if (rollDeg >= th) this.markHold("R", now, () => this.call(bind.prevPhoto, "prevPhoto", now));
        else this.lastHoldStart.R = 0;
      } else {
        if (rollDeg <= -th) this.markHold("L", now, () => this.call(bind.prevPhoto, "prevPhoto", now));
        else this.lastHoldStart.L = 0;
        if (rollDeg >= th) this.markHold("R", now, () => this.call(bind.nextPhoto, "nextPhoto", now));
        else this.lastHoldStart.R = 0;
      }

      if (pitchDeg >= th) this.markHold("F", now, () => this.call(bind.nextProduct, "nextProduct", now));
      else this.lastHoldStart.F = 0;
      if (pitchDeg <= -th) this.markHold("B", now, () => this.call(bind.prevProduct, "prevProduct", now));
      else this.lastHoldStart.B = 0;

      const sign = rollDeg > th ? 1 : rollDeg < -th ? -1 : 0;
      if (sign !== 0 && sign !== this.lastRollSign) {
        this.lastRollSign = sign;
        this.toggles.push(now);
        const win = this.opts.oscillationWindowMs;
        while (this.toggles.length && now - this.toggles[0] > win) this.toggles.shift();
        if (this.toggles.length >= this.opts.oscillationMinToggles) {
          this.toggles.length = 0;
          this.zone.run(() => this.safeCall(bind.resetToFirst));
          this.lastFire["resetToFirst"] = now;
        }
      } else if (sign === 0) {
        this.lastRollSign = 0;
      }
    });
  }

  stop(): void {
    if (this.accelHandle) {
      this.accelHandle.remove();
      this.accelHandle = undefined;
    }
    this.toggles.length = 0;
    this.lastRollSign = 0;
    this.lastHoldStart = { L: 0, R: 0, F: 0, B: 0 };
    this.lastFire = {};
  }

  private markHold(key: "L" | "R" | "F" | "B", now: number, fire: () => void): void {
    if (!this.lastHoldStart[key]) this.lastHoldStart[key] = now;
    if (now - this.lastHoldStart[key] >= this.opts.holdMs) fire();
  }

  private call(fn: () => void, name: string, now: number): void {
    const last = this.lastFire[name] || 0;
    if (now - last < this.opts.cooldownMs) return;
    this.lastFire[name] = now;
    this.safeCall(fn);
  }

  private safeCall(fn?: () => void): void {
    if (!fn) return;
    this.zone.run(() => { try { fn(); } catch { } });
  }
}