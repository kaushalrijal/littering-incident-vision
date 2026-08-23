// ============================================================================
// Incident alarm — plays a short ring whenever a live-camera incident is
// recorded.
//
// HOW TO CUSTOMISE
// ----------------
// 1. Use your own sound (recommended for a real "alarm" recording):
//      - drop an audio file into  frontend_app/public/  e.g. alarm.mp3
//      - set SOUND_URL below to '/alarm.mp3'
//    Any browser-playable format works (mp3 / wav / ogg).
//
// 2. Or tune the built-in synthesised two-tone chime (no asset needed):
//      VOLUME, TONE_HZ, TONE_MS, GAP_MS below.
//
// The alarm is silent-by-default-safe: every failure path is swallowed so it
// can never break the live stream.
// ============================================================================

export const ALARM = {
  // Path to a custom sound file served from frontend_app/public/.
  // Empty string = use the built-in synthesised chime.
  SOUND_URL: '',

  // Overall loudness, 0.0 – 1.0.
  VOLUME: 0.35,

  // Built-in chime shape: two quick tones (high then low = attention ring).
  TONE_HZ: [880, 660],
  TONE_MS: 160, // duration of each tone
  GAP_MS: 70, // silence between the tones
};

let audioCtx = null; // lazily created Web Audio context
let customAudio = null; // reused <audio> element when SOUND_URL is set

/** Prepare audio during a user gesture (Start camera click) so later
 * programme-triggered playback is allowed by browser autoplay policies. */
export function unlockAlarm() {
  try {
    if (ALARM.SOUND_URL) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch {
    /* audio unavailable — stay silent */
  }
}

/** Play the incident alarm once. Fire-and-forget; never throws. */
export function playIncidentAlarm() {
  try {
    if (ALARM.SOUND_URL) {
      if (!customAudio) {
        customAudio = new Audio(ALARM.SOUND_URL);
        customAudio.preload = 'auto';
      }
      customAudio.volume = ALARM.VOLUME;
      customAudio.currentTime = 0;
      customAudio.play().catch(() => {});
      return;
    }

    unlockAlarm();
    const ctx = audioCtx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;

    ALARM.TONE_HZ.forEach((hz, i) => {
      const startAt = t0 + (i * (ALARM.TONE_MS + ALARM.GAP_MS)) / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = hz;

      // Quick attack + smooth decay keeps the ring short and non-jarring.
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(ALARM.VOLUME, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + ALARM.TONE_MS / 1000);

      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + ALARM.TONE_MS / 1000 + 0.05);
    });
  } catch {
    /* audio unavailable — stay silent */
  }
}
