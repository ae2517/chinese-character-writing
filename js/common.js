/* 공용 유틸: DOM 도우미, 토스트, 해시, 발음(TTS) */
window.$ = (s, r = document) => r.querySelector(s);
window.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const Util = {
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },
  clock(d = new Date()) {
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":");
  },
  nat(a, b) {
    return String(a).localeCompare(String(b), "ko", { numeric: true });
  },
  uid(p = "a") {
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },
  round1(n) {
    return Math.round(n * 10) / 10;
  },
  mean(a) {
    return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  },
  async sha256(str) {
    const salt = "hanzi-writer-class-v1:";
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) { /* fall through */ }
    // crypto.subtle 이 없는 환경(http)용 간이 해시
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    const s = salt + str;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return "f" + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  },
  toast(msg, type = "") {
    let box = $("#toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "toasts";
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3200);
    setTimeout(() => t.remove(), 3700);
  }
};

/* 발음 재생
 *  1) 기기에 중국어 음성이 있으면 브라우저 음성(Web Speech API) 사용
 *  2) 없거나(특히 스마트폰·인앱 브라우저) 지원되지 않으면 오디오 파일(TTS 웹 서비스)로 대체 재생
 *  스마트폰은 사용자가 화면을 처음 터치할 때 소리 재생을 '해제'해 두어야 이후 자동 재생이 됩니다. */
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
const TTS = {
  voice: null,
  supported: "speechSynthesis" in window,
  audio: null,
  unlocked: false,
  pick() {
    if (!this.supported) return;
    const vs = speechSynthesis.getVoices() || [];
    this.voice = vs.find(v => /zh[-_]CN|cmn.*CN/i.test(v.lang)) || vs.find(v => /^zh|^cmn/i.test(v.lang)) || null;
  },
  init() {
    try { this.audio = new Audio(); this.audio.preload = "auto"; } catch (e) { this.audio = null; }
    if (this.supported) { this.pick(); speechSynthesis.onvoiceschanged = () => this.pick(); }
    const unlock = () => this.unlock();
    ["pointerdown", "touchstart", "click", "keydown"].forEach(ev => window.addEventListener(ev, unlock, { once: false, passive: true }));
  },
  /** 첫 터치 때 소리 재생 권한을 얻어 둠 (iOS/안드로이드 자동재생 제한 대응) */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      if (this.audio) { this.audio.src = SILENT; const p = this.audio.play(); if (p && p.catch) p.catch(() => { this.unlocked = false; }); }
      if (this.supported) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    } catch (e) { this.unlocked = false; }
  },
  speak(text, rate) {
    this.pick();
    if (this.supported && this.voice) {
      speechSynthesis.cancel();
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "zh-CN"; u.voice = this.voice;
        u.rate = rate || (window.APP_CONFIG && APP_CONFIG.ttsRate) || 0.8;
        speechSynthesis.speak(u);
      }, 60);
      return true;
    }
    return this.speakAudio(text);
  },
  speakAudio(text) {
    if (!this.audio) { Util.toast("이 기기에서는 발음을 재생할 수 없어요.", "warn"); return false; }
    const q = encodeURIComponent(text);
    const urls = [
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-CN&q=" + q,
      "https://fanyi.baidu.com/gettts?lan=zh&text=" + q + "&spd=5&source=web",
      "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=zh-CN&q=" + q
    ];
    const a = this.audio, token = (this._tok = (this._tok || 0) + 1);
    let i = 0;
    const next = () => {
      if (token !== this._tok) return;
      if (i >= urls.length) {
        // 마지막 수단: 음성이 없어도 브라우저 음성 시도
        if (this.supported) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "zh-CN"; speechSynthesis.speak(u); }
        else Util.toast("발음을 재생하지 못했어요. 인터넷 연결을 확인해 주세요.", "warn");
        return;
      }
      a.onerror = next;
      a.src = urls[i++];
      a.playbackRate = 0.9;
      const p = a.play();
      if (p && p.catch) p.catch(err => { if (err && err.name === "NotAllowedError") { Util.toast("🔊 버튼을 눌러 발음을 들어 보세요.", "warn"); } else next(); });
    };
    next();
    return true;
  }
};
TTS.init();

window.Util = Util; window.TTS = TTS;
