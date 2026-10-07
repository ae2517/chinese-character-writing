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

/* 발음 재생 (Web Speech API) */
const TTS = {
  voice: null,
  supported: "speechSynthesis" in window,
  pick() {
    if (!this.supported) return;
    const vs = speechSynthesis.getVoices();
    this.voice = vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
  },
  init() {
    if (!this.supported) return;
    this.pick();
    speechSynthesis.onvoiceschanged = () => this.pick();
  },
  speak(text, rate) {
    if (!this.supported) {
      Util.toast("이 브라우저는 발음 재생을 지원하지 않아요.", "warn");
      return false;
    }
    speechSynthesis.cancel();
    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      if (this.voice) u.voice = this.voice;
      u.rate = rate || (window.APP_CONFIG && APP_CONFIG.ttsRate) || 0.8;
      speechSynthesis.speak(u);
    }, 60);
    if (!this.voice && !this._warned) {
      this._warned = true;
      // 음성 목록이 늦게 올 수 있으므로 한 번만 안내
      setTimeout(() => {
        this.pick();
        if (!this.voice) Util.toast("중국어 음성을 찾지 못했어요. 기기 설정에서 중국어 음성(TTS)을 설치해 주세요.", "warn");
      }, 1500);
    }
    return true;
  }
};
TTS.init();

window.Util = Util; window.TTS = TTS;
