(() => {
  "use strict";

  const WORK_SECONDS = 60;
  const REST_SECONDS = 30;
  const TOTAL_ROUNDS = 20;
  const TOTAL_SECONDS = TOTAL_ROUNDS * (WORK_SECONDS + REST_SECONDS);

  const els = {
    startPauseBtn: document.getElementById("startPauseBtn"),
    resetBtn: document.getElementById("resetBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsPanel: document.getElementById("settingsPanel"),
    roundText: document.getElementById("roundText"),
    totalTime: document.getElementById("totalTime"),
    phaseText: document.getElementById("phaseText"),
    messageText: document.getElementById("messageText"),
    timeText: document.getElementById("timeText"),
    nextText: document.getElementById("nextText"),
    progressBar: document.getElementById("progressBar"),
    beepToggle: document.getElementById("beepToggle"),
    voiceToggle: document.getElementById("voiceToggle"),
    vibrateToggle: document.getElementById("vibrateToggle"),
    testSoundBtn: document.getElementById("testSoundBtn"),
    musicFiles: document.getElementById("musicFiles"),
    musicPlayer: document.getElementById("musicPlayer"),
    musicPlayBtn: document.getElementById("musicPlayBtn"),
    musicNextBtn: document.getElementById("musicNextBtn"),
    musicVolume: document.getElementById("musicVolume"),
    trackName: document.getElementById("trackName")
  };

  let running = false;
  let finished = false;
  let phase = "work";
  let round = 1;
  let phaseRemaining = WORK_SECONDS;
  let elapsedTotal = 0;
  let tickHandle = null;
  let nextTickAt = 0;
  let wakeLock = null;
  let audioContext = null;

  let playlist = [];
  let trackIndex = 0;
  let musicStartedByTimer = false;

  function formatClock(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function currentPhaseDuration() {
    return phase === "work" ? WORK_SECONDS : REST_SECONDS;
  }

  function setBodyMode(mode) {
    document.body.className = mode;
  }

  function render() {
    const phaseDuration = currentPhaseDuration();
    const phaseProgress = ((phaseDuration - phaseRemaining) / phaseDuration) * 100;
    const totalRemaining = TOTAL_SECONDS - elapsedTotal;

    els.roundText.textContent = `Runde ${Math.min(round, TOTAL_ROUNDS)} av ${TOTAL_ROUNDS}`;
    els.totalTime.textContent = `${formatClock(totalRemaining)} igjen`;
    els.timeText.textContent = Math.max(0, Math.ceil(phaseRemaining));
    els.progressBar.style.width = `${Math.min(100, Math.max(0, phaseProgress))}%`;

    if (finished) {
      setBodyMode("finished");
      els.phaseText.textContent = "FERDIG!";
      els.messageText.textContent = "Sterkt gjennomført 💪";
      els.timeText.textContent = "✓";
      els.nextText.textContent = "30 minutter fullført";
      els.totalTime.textContent = "0:00 igjen";
      els.progressBar.style.width = "100%";
      els.startPauseBtn.textContent = "▶ Start på nytt";
      return;
    }

    if (!running && elapsedTotal === 0) {
      setBodyMode("ready");
      els.phaseText.textContent = "KLAR";
      els.messageText.textContent = "Trykk start når du er klar";
      els.nextText.textContent = "Neste: Hvile 30 sek";
      els.startPauseBtn.textContent = "▶ Start";
      return;
    }

    if (phase === "work") {
      const warning = phaseRemaining <= 10;
      setBodyMode(warning ? "work-warning" : "work");
      els.phaseText.textContent = warning ? "HOLD UT!" : "ARBEID";
      els.messageText.textContent = warning ? "Hold ut!" : "Jobb kontrollert";
      els.nextText.textContent = "Neste: Hvile 30 sek";
    } else {
      const warning = phaseRemaining <= 5;
      setBodyMode(warning ? "rest-warning" : "rest");
      els.phaseText.textContent = warning ? "GJØR KLAR!" : "HVILE";
      els.messageText.textContent = warning ? "Gjør klar!" : "Pust og hent deg inn";
      els.nextText.textContent = round === TOTAL_ROUNDS
        ? "Neste: Økten er ferdig"
        : "Neste: Arbeid 60 sek";
    }

    els.startPauseBtn.textContent = running ? "⏸ Pause" : "▶ Fortsett";
  }

  function getAudioContext() {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioContext = new Ctx();
    }
    return audioContext;
  }

  function beep(frequency = 880, duration = 0.16, count = 1) {
    if (!els.beepToggle.checked) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") ctx.resume();

    for (let i = 0; i < count; i += 1) {
      const start = ctx.currentTime + i * (duration + 0.08);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
  }

  function speak(text) {
    if (!els.voiceToggle.checked || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "nb-NO";
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.volume = 1;

    const voices = speechSynthesis.getVoices();
    const norwegian = voices.find(v =>
      /^nb|^no/i.test(v.lang) || /Norwegian|Norsk/i.test(v.name)
    );
    if (norwegian) utterance.voice = norwegian;

    window.speechSynthesis.speak(utterance);
  }

  function vibrate(pattern) {
    if (els.vibrateToggle.checked && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  function cue(text, options = {}) {
    const { frequency = 880, count = 1, vibration = [180] } = options;
    beep(frequency, 0.15, count);
    speak(text);
    vibrate(vibration);
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch (error) {
      console.debug("Wake Lock ikke tilgjengelig:", error);
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      await wakeLock.release();
    } catch (_) {
      // Ignorer.
    }
    wakeLock = null;
  }

  function announceThresholds(previous, current) {
    if (phase === "work") {
      if (previous > 10 && current <= 10) {
        cue("Hold ut!", { frequency: 980, count: 1, vibration: [120] });
      }
      if (previous > 5 && current <= 5) {
        beep(1100, 0.1, 1);
      }
    } else if (previous > 5 && current <= 5) {
      cue("Gjør klar!", { frequency: 980, count: 1, vibration: [120] });
    }

    if (current <= 3 && current > 0 && Math.ceil(previous) !== Math.ceil(current)) {
      beep(1200, 0.08, 1);
    }
  }

  function transitionPhase() {
    if (phase === "work") {
      phase = "rest";
      phaseRemaining = REST_SECONDS;
      cue("Hvile", { frequency: 620, count: 2, vibration: [180, 80, 180] });
    } else {
      if (round >= TOTAL_ROUNDS) {
        finishWorkout();
        return;
      }
      round += 1;
      phase = "work";
      phaseRemaining = WORK_SECONDS;
      cue("Arbeid", { frequency: 900, count: 2, vibration: [220] });
    }
    render();
  }

  function processSecond() {
    if (!running || finished) return;

    const previous = phaseRemaining;
    phaseRemaining -= 1;
    elapsedTotal += 1;

    announceThresholds(previous, phaseRemaining);

    if (phaseRemaining <= 0) {
      transitionPhase();
    }

    render();
  }

  function schedulerLoop() {
    if (!running) return;

    const now = performance.now();
    while (now >= nextTickAt && running) {
      processSecond();
      nextTickAt += 1000;
    }

    tickHandle = window.setTimeout(schedulerLoop, Math.max(20, nextTickAt - performance.now()));
  }

  function startScheduler() {
    nextTickAt = performance.now() + 1000;
    clearTimeout(tickHandle);
    schedulerLoop();
  }

  async function start() {
    if (finished) reset();

    running = true;
    getAudioContext();
    requestWakeLock();

    if (elapsedTotal === 0) {
      cue("Arbeid", { frequency: 900, count: 2, vibration: [220] });
      startMusicFromTimer();
    } else if (els.musicPlayer.src && els.musicPlayer.paused && musicStartedByTimer) {
      els.musicPlayer.play().catch(() => {});
    }

    startScheduler();
    render();
  }

  function pause() {
    running = false;
    clearTimeout(tickHandle);
    releaseWakeLock();

    if (!els.musicPlayer.paused && musicStartedByTimer) {
      els.musicPlayer.pause();
    }

    render();
  }

  function toggleStartPause() {
    if (running) pause();
    else start();
  }

  function reset() {
    running = false;
    finished = false;
    phase = "work";
    round = 1;
    phaseRemaining = WORK_SECONDS;
    elapsedTotal = 0;
    clearTimeout(tickHandle);
    window.speechSynthesis?.cancel();
    releaseWakeLock();

    if (musicStartedByTimer) {
      els.musicPlayer.pause();
      els.musicPlayer.currentTime = 0;
    }

    render();
  }

  function finishWorkout() {
    running = false;
    finished = true;
    phaseRemaining = 0;
    elapsedTotal = TOTAL_SECONDS;
    clearTimeout(tickHandle);
    releaseWakeLock();
    cue("Økten er ferdig. Bra jobbet!", {
      frequency: 1040,
      count: 3,
      vibration: [250, 100, 250, 100, 350]
    });

    if (musicStartedByTimer) {
      els.musicPlayer.pause();
    }

    render();
  }

  function loadTrack(index) {
    if (!playlist.length) return;
    trackIndex = (index + playlist.length) % playlist.length;
    const file = playlist[trackIndex];

    if (els.musicPlayer.dataset.objectUrl) {
      URL.revokeObjectURL(els.musicPlayer.dataset.objectUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    els.musicPlayer.dataset.objectUrl = objectUrl;
    els.musicPlayer.src = objectUrl;
    els.trackName.textContent = `${trackIndex + 1}/${playlist.length}: ${file.name}`;
  }

  function toggleMusic() {
    if (!playlist.length) return;

    if (els.musicPlayer.paused) {
      els.musicPlayer.play()
        .then(() => {
          musicStartedByTimer = false;
          els.musicPlayBtn.textContent = "⏸ Musikk";
        })
        .catch(error => console.error("Kunne ikke starte musikk:", error));
    } else {
      els.musicPlayer.pause();
      els.musicPlayBtn.textContent = "▶ Musikk";
    }
  }

  function nextTrack(autoPlay = true) {
    if (!playlist.length) return;
    loadTrack(trackIndex + 1);
    if (autoPlay) {
      els.musicPlayer.play().catch(() => {});
    }
  }

  function startMusicFromTimer() {
    if (!playlist.length) return;
    musicStartedByTimer = true;
    els.musicPlayer.play()
      .then(() => {
        els.musicPlayBtn.textContent = "⏸ Musikk";
      })
      .catch(() => {
        // Mobilnettlesere kan kreve et ekstra trykk på Musikk-knappen.
      });
  }

  els.startPauseBtn.addEventListener("click", toggleStartPause);
  els.resetBtn.addEventListener("click", reset);

  els.settingsBtn.addEventListener("click", () => {
    els.settingsPanel.classList.toggle("hidden");
  });

  els.testSoundBtn.addEventListener("click", () => {
    getAudioContext();
    cue("Arbeid. Hold ut! Gjør klar!", {
      frequency: 880,
      count: 2,
      vibration: [150, 80, 150]
    });
  });

  els.musicFiles.addEventListener("change", event => {
    playlist = Array.from(event.target.files || []);
    trackIndex = 0;
    const enabled = playlist.length > 0;
    els.musicPlayBtn.disabled = !enabled;
    els.musicNextBtn.disabled = !enabled;

    if (enabled) {
      loadTrack(0);
    } else {
      els.trackName.textContent = "Ingen musikk valgt";
      els.musicPlayer.removeAttribute("src");
    }
  });

  els.musicPlayBtn.addEventListener("click", toggleMusic);
  els.musicNextBtn.addEventListener("click", () => nextTrack(true));

  els.musicVolume.addEventListener("input", event => {
    els.musicPlayer.volume = Number(event.target.value);
  });

  els.musicPlayer.volume = Number(els.musicVolume.value);

  els.musicPlayer.addEventListener("ended", () => nextTrack(true));
  els.musicPlayer.addEventListener("play", () => {
    els.musicPlayBtn.textContent = "⏸ Musikk";
  });
  els.musicPlayer.addEventListener("pause", () => {
    els.musicPlayBtn.textContent = "▶ Musikk";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && running) {
      requestWakeLock();
    }
  });


  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  render();
})();
