/** Song clock. Song time is in seconds at 100 % speed; wall time is performance.now() milliseconds. */
export class Transport {
  playing = false;
  rate = 1;
  duration = 0;
  private t0 = 0;
  private w0 = 0;

  time(wall: number = performance.now()): number {
    if (!this.playing) return this.t0;
    return Math.min(this.duration, this.t0 + ((wall - this.w0) / 1000) * this.rate);
  }

  /** Wall time at which the given song time is reached, valid while playing. */
  wallAt(songTime: number): number {
    return this.w0 + ((songTime - this.t0) / this.rate) * 1000;
  }

  play(wall: number = performance.now()): void {
    if (this.playing) return;
    this.w0 = wall;
    this.playing = true;
  }

  pause(wall: number = performance.now()): void {
    if (!this.playing) return;
    this.t0 = this.time(wall);
    this.playing = false;
  }

  seek(songTime: number, wall: number = performance.now()): void {
    this.t0 = Math.min(this.duration, songTime);
    this.w0 = wall;
  }

  setRate(rate: number, wall: number = performance.now()): void {
    this.t0 = this.time(wall);
    this.w0 = wall;
    this.rate = rate;
  }

  get ended(): boolean {
    return this.time() >= this.duration;
  }
}
