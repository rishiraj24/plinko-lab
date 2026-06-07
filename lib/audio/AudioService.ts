// lib/audio/AudioService.ts

export class AudioService {
    private ctx: AudioContext | null = null
    private muted = false

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Call this inside a user gesture (button click, keydown) before any sound.
     * Safe to call multiple times — creates AudioContext only once.
     */
    init() {
        if (this.ctx) return
        this.ctx = new AudioContext()
    }

    get isMuted(): boolean {
        return this.muted
    }

    toggleMute(): boolean {
        this.muted = !this.muted
        if (this.ctx) {
            // Suspend/resume the entire context so oscillators stop immediately
            if (this.muted) {
                this.ctx.suspend()
            } else {
                this.ctx.resume()
            }
        }
        return this.muted
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private getCtx(): AudioContext | null {
        if (this.muted || !this.ctx) return null
        return this.ctx
    }

    /**
     * Creates and auto-stops an oscillator.
     *
     * @param frequency  Hz
     * @param type       OscillatorType ('sine' | 'square' | 'sawtooth' | 'triangle')
     * @param gain       output amplitude 0..1
     * @param duration   seconds
     * @param startTime  AudioContext time to start (default: now)
     * @param freqEnd    if set, frequency ramps linearly from `frequency` to `freqEnd`
     */
    private playOscillator(
        frequency: number,
        type: OscillatorType,
        gain: number,
        duration: number,
        startTime?: number,
        freqEnd?: number,
    ): void {
        const ctx = this.getCtx()
        if (!ctx) return

        const now = startTime ?? ctx.currentTime
        const osc = ctx.createOscillator()
        const gainNode = ctx.createGain()

        osc.type = type
        osc.frequency.setValueAtTime(frequency, now)
        if (freqEnd !== undefined) {
            osc.frequency.linearRampToValueAtTime(freqEnd, now + duration)
        }

        gainNode.gain.setValueAtTime(gain, now)
        // Fade out in the last 20% to avoid clicks
        gainNode.gain.linearRampToValueAtTime(0, now + duration)

        osc.connect(gainNode)
        gainNode.connect(ctx.destination)

        osc.start(now)
        osc.stop(now + duration)
    }

    // ── Public sounds ─────────────────────────────────────────────────────────

    /**
     * Short peg-hit tick. Called once per row during ball animation.
     * Very quiet so 12 ticks don't overwhelm the ear.
     */
    playTick(): void {
        this.playOscillator(800, 'sine', 0.08, 0.05)
    }

    /**
     * Bin-landing sweep. Ascending pitch proportional to multiplier.
     * Higher payout = higher endpoint frequency = more satisfying sound.
     *
     * @param multiplier  e.g. 0.2, 1, 3, 10
     */
    playLand(multiplier: number): void {
        const ctx = this.getCtx()
        if (!ctx) return

        // Scale endpoint: 0.2× → 400 Hz, 10× → 900 Hz
        const freqEnd = 300 + Math.min(multiplier / 10, 1) * 600

        this.playOscillator(300, 'sine', 0.25, 0.3, undefined, freqEnd)

        // Add a subtle harmonics layer for larger wins
        if (multiplier >= 2) {
            this.playOscillator(freqEnd * 1.5, 'sine', 0.1, 0.2, ctx.currentTime + 0.15)
        }
    }

    /**
     * Three-note ascending chord for 10× jackpot.
     * Notes: C5 (523 Hz), E5 (659 Hz), G5 (784 Hz) staggered 120ms apart.
     */
    playGolden(): void {
        const ctx = this.getCtx()
        if (!ctx) return

        const notes = [523, 659, 784]
        notes.forEach((freq, i) => {
            this.playOscillator(freq, 'sine', 0.2, 0.4, ctx.currentTime + i * 0.12)
        })
    }

    /**
     * Short low buzz for API errors.
     */
    playError(): void {
        this.playOscillator(120, 'sawtooth', 0.15, 0.18)
    }
}

// Singleton — import this wherever audio is needed
export const audioService = new AudioService()