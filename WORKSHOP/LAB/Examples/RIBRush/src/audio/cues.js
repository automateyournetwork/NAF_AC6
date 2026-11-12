const cueNotes = {
  start: [440],
  correct: [660, 880],
  wrong: [220, 165],
  missed: [196, 146],
  "level-up": [523, 659, 784],
  "game-over": [392, 330, 262],
  "run-complete": [523, 659, 784, 1047],
};

export function createAudioCues() {
  let context;
  let muted = false;

  function setMuted(value) {
    muted = Boolean(value);
  }

  function play(cue) {
    if (muted || !cueNotes[cue] || typeof AudioContext !== "function") {
      return;
    }

    context ??= new AudioContext();
    if (context.state === "suspended") {
      void context.resume();
    }

    for (const [index, frequency] of cueNotes[cue].entries()) {
      const startAt = context.currentTime + index * 0.11;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.1);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.11);
    }
  }

  return { play, setMuted };
}
