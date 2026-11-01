const GOOGLE_TTS = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=de&q=";
const BACKUP_TTS = "https://dict.youdao.com/dictvoice?le=de&audio=";
const LINGVA_TTS = [
  "https://translate.plausibility.cloud/api/v1/audio/de/",
  "https://lingva.lunar.icu/api/v1/audio/de/",
];

let cachedGermanVoice = null;
let audioEl = null;
let speechToken = 0;
let currentObjectUrl = null;

function findGenuineGermanVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const novelty = /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|pipe organ|trinoids|whisper|zarvox|jester|superstar|wobble/i;
  const german = voices.filter((v) => {
    if (!v || !v.lang) return false;
    return v.lang.replace("_", "-").toLowerCase().startsWith("de") && !novelty.test(v.name || "");
  });
  if (!german.length) return null;

  const preferred = ["anna", "helena", "petra", "viktor", "martin", "markus", "google deutsch", "siri", "marlene"];
  for (const name of preferred) {
    const match = german.find((v) => (v.name || "").toLowerCase().includes(name));
    if (match) return match;
  }
  return german.find((v) => v.lang.replace("_", "-").toLowerCase() === "de-de") || german[0];
}

if ("speechSynthesis" in window) {
  cachedGermanVoice = findGenuineGermanVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedGermanVoice = findGenuineGermanVoice();
  };
}

function releaseObjectUrl() {
  if (!currentObjectUrl) return;
  URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
}

function getAudio() {
  if (audioEl?.isConnected) return audioEl;
  audioEl = document.getElementById("ttsAudio") || document.createElement("audio");
  if (!audioEl.id) audioEl.id = "ttsAudio";
  audioEl.referrerPolicy = "no-referrer";
  audioEl.preload = "none";
  if (!audioEl.isConnected) document.body.append(audioEl);
  return audioEl;
}

function speakOffline(phrase, done) {
  const synth = window.speechSynthesis;
  if (!synth) return done();
  const voice = cachedGermanVoice || findGenuineGermanVoice();
  if (!voice) return done();

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    done();
  };

  try {
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.voice = voice;
    utter.lang = "de-DE";
    utter.rate = 0.9;
    utter.pitch = 1;
    utter.onend = finish;
    utter.onerror = finish;
    synth.speak(utter);
  } catch {
    finish();
  }
}

function playUrl(audio, url, onEnd, onFail) {
  let settled = false;
  const end = () => {
    if (settled) return;
    settled = true;
    onEnd();
  };
  const fail = () => {
    if (settled) return;
    settled = true;
    onFail();
  };

  audio.onended = end;
  audio.onerror = fail;
  audio.src = url;
  try {
    const playing = audio.play();
    if (playing?.catch) playing.catch(fail);
  } catch {
    fail();
  }
}

async function playLingva(phrase, token, done, onFail) {
  for (const base of LINGVA_TTS) {
    if (token !== speechToken) return;
    let controller;
    try {
      controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      let res;
      try {
        res = await fetch(base + encodeURIComponent(phrase), { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) continue;
      const body = await res.json();
      if (!Array.isArray(body.audio) || !body.audio.length) continue;
      if (token !== speechToken) return;
      releaseObjectUrl();
      const url = URL.createObjectURL(new Blob([new Uint8Array(body.audio)], { type: "audio/mpeg" }));
      currentObjectUrl = url;
      playUrl(
        getAudio(),
        url,
        () => {
          releaseObjectUrl();
          if (token === speechToken) done();
        },
        () => {
          releaseObjectUrl();
          if (token === speechToken) onFail();
        },
      );
      return;
    } catch {}
  }
  if (token === speechToken) onFail();
}

function playPhrase(phrase, token, done) {
  if (token !== speechToken) return;
  const audio = getAudio();
  const encoded = encodeURIComponent(phrase);

  playUrl(
    audio,
    GOOGLE_TTS + encoded,
    () => token === speechToken && done(),
    () => {
      if (token !== speechToken) return;
      playUrl(
        audio,
        BACKUP_TTS + encoded,
        () => token === speechToken && done(),
        () => {
          if (token !== speechToken) return;
          playLingva(phrase, token, done, () => {
            if (token !== speechToken) return;
            speakOffline(phrase, () => token === speechToken && done());
          });
        },
      );
    },
  );
}

export function cancelGermanSpeech() {
  speechToken += 1;
  releaseObjectUrl();
  try {
    getAudio().pause();
  } catch {
    /* nothing to stop */
  }
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* nothing to stop */
    }
  }
}

export function speakGerman(phrase, buttonEl = null) {
  speakGermanSequence([phrase], buttonEl);
}

export function speakGermanSequence(phrases, buttonEl = null) {
  const list = phrases.map((p) => String(p ?? "").trim()).filter(Boolean);
  if (!list.length) return;
  cancelGermanSpeech();
  const token = speechToken;

  if (buttonEl) {
    buttonEl.classList.remove("speaking-pulse");
    void buttonEl.offsetWidth;
    buttonEl.classList.add("speaking-pulse");
  }

  const step = (i) => {
    if (token !== speechToken) return;
    if (i >= list.length) return;
    playPhrase(list[i], token, () => step(i + 1));
  };
  step(0);
}
