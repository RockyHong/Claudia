/**
 * Looping ambient audio controller.
 * Plays a typing sound loop during busy state when enabled.
 */

export function createAmbienceController(src = "/sfx/typing-ambience.mp3") {
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = 0.2;
  let playing = false;

  return {
    start() {
      if (playing) return;
      playing = true;
      audio.play().catch(() => {});
    },

    stop() {
      if (!playing) return;
      playing = false;
      audio.pause();
      audio.currentTime = 0;
    },
  };
}
