/* 한자 획 데이터 로딩 + 田字格 연습칸(CharBox): 획순 애니메이션, 회색 따라쓰기, 손글씨 입력 */
const SVGNS = "http://www.w3.org/2000/svg";
const FLIP = "scale(1,-1) translate(0,-900)"; // hanzi-writer-data 좌표 → 화면 좌표

function S(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

const Hanzi = {
  cache: new Map(),
  isHan(c) { return /[㐀-鿿豈-﫿]/.test(c); },
  /** 글자 데이터. 없는 글자 = null, 네트워크 오류 = undefined */
  async load(ch) {
    if (this.cache.has(ch)) return this.cache.get(ch);
    const enc = encodeURIComponent(ch);
    const urls = [
      `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${enc}.json`,
      `https://unpkg.com/hanzi-writer-data@2.0.1/${enc}.json`
    ];
    let result;
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (r.ok) { result = await r.json(); break; }
        if (r.status === 404) { result = null; break; }
      } catch (e) { /* 다음 주소 시도 */ }
    }
    if (result !== undefined) this.cache.set(ch, result);
    return result;
  }
};

const sleep = (ms, tok) => new Promise(res => {
  const t = setTimeout(res, ms);
  if (tok) tok.wake = () => { clearTimeout(t); res(); };
});

let boxSeq = 0;

class CharBox {
  constructor(host, data) {
    this.id = ++boxSeq;
    this.data = data;
    this.n = data.strokes.length;
    this.meds = data.medians.map(m => m.map(p => [p[0], 900 - p[1]]));
    this.enabled = false;
    this.drawing = false;
    host.innerHTML = "";
    const svg = this.svg = S("svg", { viewBox: "0 0 1024 1024", class: "cbox" }, host);
    S("rect", { x: 0, y: 0, width: 1024, height: 1024, class: "cb-bg" }, svg);
    S("line", { x1: 512, y1: 0, x2: 512, y2: 1024, class: "cb-dash" }, svg);
    S("line", { x1: 0, y1: 512, x2: 1024, y2: 512, class: "cb-dash" }, svg);
    S("rect", { x: 0, y: 0, width: 1024, height: 1024, class: "cb-border" }, svg);
    this.gray = S("g", { class: "cb-gray", transform: FLIP }, svg);
    data.strokes.forEach(d => S("path", { d }, this.gray));
    this.gray.style.display = "none";
    this.nextG = S("g", { class: "cb-next", transform: FLIP }, svg);
    this.fbG = S("g", { class: "cb-fb", transform: FLIP }, svg);
    this.animG = S("g", { class: "cb-anim", transform: FLIP }, svg);
    this.hintG = S("g", { class: "cb-anim hint", transform: FLIP }, svg);
    this.userG = S("g", { class: "cb-user" }, svg);
    this.markG = S("g", { class: "cb-mark" }, svg);
    this._bind();
  }

  _bind() {
    const svg = this.svg;
    const pt = e => {
      const r = svg.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 1024, ((e.clientY - r.top) / r.height) * 1024];
    };
    svg.addEventListener("pointerdown", e => {
      if (!this.enabled || this.drawing) return;
      e.preventDefault();
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this.pts = [pt(e)];
      this.live = S("path", { class: "u-live" }, this.userG);
      this.live.setAttribute("d", CharBox.pathD(this.pts));
      this.drawing = true; CharBox.drawingNow = true;
      if (this.onStart) this.onStart();
    });
    svg.addEventListener("pointermove", e => {
      if (!this.drawing) return;
      e.preventDefault();
      const p = pt(e), last = this.pts[this.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 4) return;
      this.pts.push(p);
      this.live.setAttribute("d", CharBox.pathD(this.pts));
    });
    const end = e => {
      if (!this.drawing) return;
      this.drawing = false; CharBox.drawingNow = false;
      const pts = this.pts, path = this.live;
      this.live = null;
      if (e.type === "pointercancel") { path.remove(); return; }
      if (this.onStroke) this.onStroke(pts, path);
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("contextmenu", e => e.preventDefault());
    CharBox.installScrollLock();
  }

  /** 쓰기 칸을 터치하는 동안 화면이 스크롤되지 않게 고정 (삼성 인터넷/크롬/사파리 공통)
   *  1) touchstart/touchmove 를 문서 수준에서 먼저 가로채 기본 동작(스크롤)을 취소
   *  2) 터치 중에는 페이지를 position:fixed 로 고정해, 브라우저가 스크롤을 시도해도 움직일 곳이 없게 함 */
  static installScrollLock() {
    if (CharBox._lockInstalled) return;
    CharBox._lockInstalled = true;
    let y = 0, touching = false;
    const inBoxes = e => e.target && e.target.closest && e.target.closest(".boxes");
    const lock = () => {
      if (touching) return;
      touching = true; y = window.scrollY;
      const b = document.body.style;
      b.position = "fixed"; b.top = -y + "px"; b.left = "0"; b.right = "0"; b.width = "100%";
    };
    const unlock = () => {
      if (!touching) return;
      touching = false;
      const b = document.body.style;
      b.position = ""; b.top = ""; b.left = ""; b.right = ""; b.width = "";
      window.scrollTo(0, y);
    };
    document.addEventListener("touchstart", e => {
      if (inBoxes(e)) { e.preventDefault(); lock(); }
    }, { passive: false, capture: true });
    document.addEventListener("touchmove", e => { if (touching) e.preventDefault(); }, { passive: false, capture: true });
    ["touchend", "touchcancel"].forEach(t => document.addEventListener(t, e => {
      if (!e.touches || e.touches.length === 0) unlock();      // 손가락이 모두 떨어지면 해제
    }, { capture: true }));
    window.addEventListener("blur", unlock);
  }

  static pathD(p) {
    if (p.length === 1) return `M${p[0][0]} ${p[0][1]}l0.1 0`;
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      d += `Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    const l = p[p.length - 1];
    return d + `L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
  }

  setEnabled(b) { this.enabled = b; this.svg.classList.toggle("active", b); }
  setGray(b) { this.gray.style.display = b ? "" : "none"; }
  setDim(b) { this.svg.classList.toggle("dim", b); }

  /** 다음에 쓸 획을 연한 파란색으로 표시(따라쓰기용) */
  setNext(idx) {
    this.nextG.innerHTML = "";
    if (idx != null && idx >= 0 && idx < this.n) S("path", { d: this.data.strokes[idx] }, this.nextG);
  }
  /** 정답 획을 잠깐 강조(오류 피드백) */
  flash(idx, ms = 2200) {
    const p = S("path", { d: this.data.strokes[idx] }, this.fbG);
    setTimeout(() => p.remove(), ms);
  }
  /** 정답 시작점 표시 */
  marker(pt, ms = 2200) {
    const g = S("g", {}, this.markG);
    S("circle", { cx: pt[0], cy: pt[1], r: 34, class: "mk-ring" }, g);
    S("circle", { cx: pt[0], cy: pt[1], r: 12, class: "mk-dot" }, g);
    setTimeout(() => g.remove(), ms);
  }
  clearUser() { this.userG.innerHTML = ""; }
  clearFeedback() { this.fbG.innerHTML = ""; this.markG.innerHTML = ""; }

  /* ---- 획순 애니메이션 ---- */
  _animate(dur, cb, tok) {
    return new Promise(res => {
      tok.pending = res;                       // stop() 이 즉시 끊을 수 있도록
      const t0 = performance.now();
      const f = t => {
        if (tok.cancel) return res(false);
        const p = Math.min(1, (t - t0) / dur);
        cb(p * p * (3 - 2 * p));
        if (p < 1) requestAnimationFrame(f); else res(true);
      };
      requestAnimationFrame(f);
    });
  }
  async _drawStroke(g, i, tok) {
    const cid = `clip${this.id}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    const cp = S("clipPath", { id: cid }, g);
    S("path", { d: this.data.strokes[i] }, cp);
    const m = this.data.medians[i];
    const d = "M" + m.map(p => p.join(" ")).join("L");
    const path = S("path", { d, "clip-path": `url(#${cid})` }, g);
    const len = Math.max(path.getTotalLength(), 1);
    path.style.strokeDasharray = `${len} ${len * 2}`;
    path.style.strokeDashoffset = len;
    const ok = await this._animate(Math.max(380, len / 0.9), p => { path.style.strokeDashoffset = len * (1 - p); }, tok);
    if (ok) path.style.strokeDashoffset = 0;
    return ok;
  }
  /** 전체 획순 애니메이션. 끝까지 재생되면 true */
  async play() {
    this.stop();
    const tok = this.tok = { cancel: false };
    this.animG.innerHTML = "";
    for (let i = 0; i < this.n; i++) {
      if (!(await this._drawStroke(this.animG, i, tok))) return false;
      await sleep(260, tok);
      if (tok.cancel) return false;
    }
    return true;
  }
  /** 한 획만 보여주기(힌트) */
  async animateOne(idx) {
    const tok = { cancel: false };
    this.hintG.innerHTML = "";
    await this._drawStroke(this.hintG, idx, tok);
    await sleep(1100);
    this.hintG.innerHTML = "";
  }
  stop() {
    if (!this.tok) return;
    this.tok.cancel = true;
    if (this.tok.wake) this.tok.wake();
    if (this.tok.pending) this.tok.pending(false);
  }
  clearAnim() { this.animG.innerHTML = ""; }
}

window.Hanzi = Hanzi;
window.CharBox = CharBox;
