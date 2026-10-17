// Real POS Scanner Audio Cues using Web Audio API (100% Reliable, Zero Network Latency)
let globalAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {});
    }
    return globalAudioCtx;
  } catch (e) {
    return null;
  }
}

// Warm up and unlock AudioContext on first user interaction (touch/click/key)
export function ensureAudioUnlocked(): Promise<boolean> {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return Promise.resolve(false);

    // Force-unlock audio hardware on iOS Safari and mobile Chrome via micro-buffer
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {}

    if (ctx.state === 'suspended') {
      return ctx.resume().then(() => true).catch(() => false);
    }
    return Promise.resolve(ctx.state === 'running');
  } catch {
    return Promise.resolve(false);
  }
}

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    ensureAudioUnlocked();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

let posBellAudio: HTMLAudioElement | null = null;
function playPosBellAudioFile() {
  if (typeof window === 'undefined') return;
  try {
    if (!posBellAudio) {
      posBellAudio = new Audio('/sounds/radar-pos-bell.wav');
      posBellAudio.preload = 'auto';
    }
    posBellAudio.currentTime = 0;
    posBellAudio.play().catch(() => {});
  } catch {}
}

export function playBeepSound(
  type: 'success' | 'redeem' | 'error' | 'notification' | 'commission' | 'pos_order_alert' | 'kitchen_order_ding' = 'success'
) {
  // 📳 Mobile Physical Device Vibration (works even when muted or low volume)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'pos_order_alert') {
        navigator.vibrate([400, 150, 400, 150, 600]);
      } else if (type === 'kitchen_order_ding') {
        navigator.vibrate([300, 100, 300, 100, 500]);
      } else if (type === 'notification') {
        navigator.vibrate([250, 120, 250]);
      } else if (type === 'error') {
        navigator.vibrate([300, 100, 300]);
      } else {
        navigator.vibrate([80]);
      }
    } catch {}
  }

  // 🔔 Also play real WAV audio file for OS media session playback (active when screen locked)
  if (type === 'pos_order_alert') {
    playPosBellAudioFile();
  }

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const renderSound = () => {
      const t = ctx.currentTime;

    if (type === 'kitchen_order_ding') {
      // 👨‍🍳 Authentic Kitchen Bell / Service Chime (D5 -> A5 -> D6)
      const kitchenNotes = [587.33, 880.0, 1174.66];
      kitchenNotes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 2 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        gain.gain.setValueAtTime(0.5, t + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + 0.45);
      });
    } else if (type === 'pos_order_alert') {
      // 🛎️ Clear Loud Restaurant / POS Melodic Bell (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.09);
        gain.gain.setValueAtTime(0.55, t + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.09 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + idx * 0.09);
        osc.stop(t + idx * 0.09 + 0.35);
      });
    } else if (type === 'notification') {
      // 🔔 Modern Crisp Double Bell Notification (G5 -> C6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(784.0, t); // G5
      gain1.gain.setValueAtTime(0.4, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.15);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.5, t + 0.08); // C6
      gain2.gain.setValueAtTime(0.45, t + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.08);
      osc2.stop(t + 0.35);
    } else if (type === 'commission') {
      // 💰 Partner Commission / Cash Register Ka-Ching (E6 - G6 - B6 - E7)
      [1318.5, 1567.98, 1975.5, 2637.0].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.05);
        gain.gain.setValueAtTime(0.35, t + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.05);
        osc.stop(t + i * 0.05 + 0.25);
      });
    } else if (type === 'success') {
      // 🟢 200 OK: Crisp High Dual-Tone POS Scan Chime (High Bell: 1975Hz -> 2637Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1975.5, t); // B6
      gain1.gain.setValueAtTime(0.45, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.1);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2637, t + 0.07); // E7
      gain2.gain.setValueAtTime(0.5, t + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.07);
      osc2.stop(t + 0.22);
    } else if (type === 'redeem') {
      // ✨ Reward / Coupon Burn: Celebratory Multi-Chime (C6 - E6 - G6 - C7)
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.06);
        gain.gain.setValueAtTime(0.4, t + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.06);
        osc.stop(t + i * 0.06 + 0.18);
      });
    } else {
      // 🔴 400/500 / Rejected: Double Low-Pitch Error Buzzer (160Hz Sawtooth)
      [0, 0.12].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, t + offset);
        gain.gain.setValueAtTime(0.45, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, t + offset + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + offset);
      });
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(renderSound).catch(renderSound);
  } else {
    renderSound();
  }
} catch (e) {
  console.warn('Audio playback not supported or blocked:', e);
}
}
