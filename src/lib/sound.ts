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

// Warm up AudioContext immediately on first user touch/click on screen
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

export function playBeepSound(type: 'success' | 'redeem' | 'error' = 'success') {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;

    if (type === 'success') {
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
        osc.stop(t + offset + 0.1);
      });
    }
  } catch (e) {
    console.warn('Audio playback not supported or blocked:', e);
  }
}
