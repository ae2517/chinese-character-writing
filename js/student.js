/* 학생 화면 */
(() => {
  const CFG = window.APP_CONFIG;
  const st = { user: null, words: [], lesson: null, word: null, chars: [], skippedChars: [] };
  let R = null;           // 현재 회차(Round) 상태
  let tokenSeq = 0;
  let timerHandle = null;

  /* ============ 시작 ============ */
  try { DB.init(); } catch (e) { alert(e.message); }
  if (DB.demo) $("#demoBanner").classList.remove("hidden");
  renderConsent();
  bindAuth();
  restoreSession();
  window.addEventListener("online", () => DB.flushPending().then(updateSync));

  function show(id) {
    ["viewAuth", "viewHome", "viewPractice"].forEach(v => $("#" + v).classList.toggle("hidden", v !== id));
    window.scrollTo(0, 0);
  }

  /* ============ 인증 ============ */
  function renderConsent() {
    $("#consentText").innerHTML = `
      <h4>연구 참여 및 개인정보 수집·이용 안내</h4>
      <p><b>1. 연구자</b><br>전북대학교 중국·아시아연구소 학술연구교수 윤애경 (문의: 2517ae@hanmail.net)</p>
      <p><b>2. 연구 목적</b><br>본 연구는 간화자 학습 앱을 활용하여, 오류를 확인하고 반복 쓰기 연습 과정에서 학습자의 간화자 쓰기 정확도가 어떻게 변화하는지 분석하며, 그 결과를 수업 개선에 활용하는 것을 목적으로 합니다.</p>
      <p><b>3. 수집하는 개인정보 항목</b><br>가입 정보: 학습자 ID, 전화번호(ID·비밀번호 찾기용), 국적, 성별, 전공, 학년, 중국어·한자 학습 기간, 한자 친숙도<br>학습 기록: 학습 날짜, 학습 단어, 연습 횟수, 시도별 소요 시간, 획수·획순·시작 위치·자형 오류 및 점수, 학습자가 쓴 간화자 글씨 이미지(시도별)</p>
      <p><b>4. 개인정보 이용 목적 및 결과 공개</b><br>수집된 개인정보는 본 연구의 분석 및 수업 개선 목적으로만 이용합니다. 학술논문 등으로 연구 결과를 발표할 때는 개인을 식별할 수 없는 통계 형태로 제시합니다.</p>
      <p><b>5. 개인정보 보유·이용 기간 및 파기</b><br>수집된 개인정보는 수집일부터 연구 종료 후 3년까지 보관하며, 보관 기간이 끝나면 복구할 수 없는 방법으로 파기합니다.</p>
      <p><b>6. 자발적 참여 및 동의 거부에 관한 안내</b><br>연구 참여는 자발적이며, 연구 참여 및 연구 목적의 개인정보 수집·이용에 동의하지 않아도 성적이나 평가 등에 어떠한 불이익도 없습니다.</p>
      <p><b>7. 동의 철회 및 개인정보 삭제 요청</b><br>연구 참여에 동의한 후에도 위 문의처를 통해 언제든지 동의를 철회하거나 개인정보 삭제를 요청할 수 있습니다. 다만, 개인과의 연결이 불가능한 익명 통계로 집계되었거나 이미 발표된 연구 결과에서는 해당 자료를 개별적으로 찾아 제거하기 어려울 수 있습니다. 법령에 따라 보관해야 하는 연구 동의서 등은 법정 보관 기간 동안 보관될 수 있습니다.</p>`;
  }

  function bindAuth() {
    $$(".tab").forEach(b => b.onclick = () => {
      $$(".tab").forEach(x => x.classList.toggle("on", x === b));
      $("#formLogin").classList.toggle("hidden", b.dataset.t !== "login");
      $("#formSignup").classList.toggle("hidden", b.dataset.t !== "signup");
    });
    bindRecovery();
    $("#suNat").onchange = e => $("#suNatEtc").classList.toggle("hidden", e.target.value !== "기타");

    $("#formLogin").onsubmit = async e => {
      e.preventDefault();
      const id = $("#lgId").value.trim().toLowerCase(), pw = $("#lgPw").value;
      $("#lgErr").textContent = "";
      const G = CFG.guest;
      if (id === G.id) {                                   // 게스트: 서버에 아무것도 저장하지 않음
        if (pw !== G.password) { $("#lgErr").textContent = "게스트 비밀번호가 맞지 않아요."; return; }
        localStorage.setItem("hz_session", JSON.stringify({ id, guest: true }));
        enter({ id, guest: true }, "guest");
        return;
      }
      try {
        const s = await DB.getStudent(id);
        if (!s) { $("#lgErr").textContent = "등록되지 않은 ID예요. 'ID'를 확인하거나 회원가입을 해 주세요."; return; }
        const h = await Util.sha256(id + ":" + pw);
        if (h !== s.passHash) { $("#lgErr").textContent = "비밀번호가 맞지 않아요. 다시 입력해 주세요. (횟수 제한 없음)"; $("#lgPw").select(); return; }
        localStorage.setItem("hz_session", JSON.stringify({ id, h }));
        enter(s, "login");
      } catch (err) {
        console.error(err);
        $("#lgErr").textContent = "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
      }
    };

    $("#formSignup").onsubmit = async e => {
      e.preventDefault();
      const err = $("#suErr"); err.textContent = "";
      const f = e.target;
      const id = $("#suId").value.trim().toLowerCase(), pw = $("#suPw").value;
      if (id === CFG.guest.id) { err.textContent = "이 ID는 체험용으로 예약되어 있어요. 다른 ID를 써 주세요."; return; }
      if (!/^[0-9]{1,10}$/.test(id)) { err.textContent = "학습자 ID는 학번(숫자 10자리 이내)만 입력할 수 있어요."; return; }
      if (pw.length < 4) { err.textContent = "비밀번호는 4자 이상이어야 해요."; return; }
      const consent = f.consent.value;
      if (!consent) { err.textContent = "연구 참여 동의 여부를 선택해 주세요."; return; }
      let nat = $("#suNat").value;
      if (nat === "기타") nat = $("#suNatEtc").value.trim() || "기타";
      const phone = normPhone($("#suPhone").value);
      if (!phone) { err.textContent = "전화번호를 8~15자리 숫자로 입력해 주세요."; return; }
      const num = x => Math.max(0, parseInt($(x).value, 10) || 0);
      const s = {
        id, passHash: await Util.sha256(id + ":" + pw),
        nationality: nat, gender: f.gender.value, major: $("#suMajor").value.trim(), grade: $("#suGrade").value,
        chineseMonths: num("#suCnY") * 12 + num("#suCnM"), hanziMonths: num("#suHzY") * 12 + num("#suHzM"),
        familiarity: parseInt(f.fam.value, 10),
        consent: consent === "yes", consentAt: new Date().toISOString(), consentVersion: CFG.consentVersion,
        createdAt: Date.now(), createdDate: Util.today()
      };
      if (!s.gender || !s.familiarity) { err.textContent = "성별과 한자 친숙도를 선택해 주세요."; return; }
      try {
        if (await DB.getStudent(id)) { err.textContent = "이미 사용 중인 ID예요. 다른 ID를 써 주세요."; return; }
        await DB.createStudent(s, await phoneHash(phone));
        localStorage.setItem("hz_session", JSON.stringify({ id, h: s.passHash }));
        Util.toast("가입 완료! 환영해요 🎉", "ok");
        enter(s, "signup");
      } catch (ex) {
        console.error(ex);
        err.textContent = ex && ex.message === "phone-exists"
          ? "이 전화번호로 이미 가입된 ID가 있어요. 로그인 화면의 '아이디 찾기'를 이용해 주세요."
          : "가입을 저장하지 못했어요. (이미 있는 ID이거나 네트워크 문제)";
      }
    };
    $("#btnLogout").onclick = () => {
      localStorage.removeItem("hz_session");
      st.user = null; stopTimer();
      $("#who").classList.add("hidden"); $("#btnLogout").classList.add("hidden");
      show("viewAuth");
    };
  }

  /* ---- 아이디 찾기 / 비밀번호 재설정 (전화번호) ---- */
  function normPhone(v) { const d = String(v || "").replace(/\D/g, ""); return d.length >= 8 && d.length <= 15 ? d : ""; }
  const phoneHash = p => Util.sha256("phone:" + p);

  function bindRecovery() {
    const panes = { login: "#formLogin", findId: "#formFindId", resetPw: "#formResetPw" };
    const go = k => Object.entries(panes).forEach(([n, sel]) => $(sel).classList.toggle("hidden", n !== k));
    $$("[data-rec]").forEach(b => b.onclick = () => { $("#fiMsg").textContent = ""; $("#rpMsg").textContent = ""; go(b.dataset.rec === "back" ? "login" : b.dataset.rec); });
    $("#formFindId").onsubmit = async e => {
      e.preventDefault();
      const msg = $("#fiMsg"); msg.className = "err"; msg.textContent = "";
      const p = normPhone($("#fiPhone").value);
      if (!p) { msg.textContent = "전화번호를 8~15자리 숫자로 입력해 주세요."; return; }
      try {
        const id = await DB.findIdByPhone(await phoneHash(p));
        if (!id) { msg.textContent = "이 전화번호로 가입된 ID가 없어요."; return; }
        msg.className = "small"; msg.innerHTML = "가입된 학습자 ID: <b style=\"font-size:1.2rem\">" + Util.esc(id) + "</b>";
        $("#lgId").value = id;
      } catch (err) { console.error(err); msg.textContent = "조회하지 못했어요. 인터넷 연결을 확인해 주세요."; }
    };
    $("#formResetPw").onsubmit = async e => {
      e.preventDefault();
      const msg = $("#rpMsg"); msg.className = "err"; msg.textContent = "";
      const id = $("#rpId").value.trim().toLowerCase(), pw = $("#rpPw").value, p = normPhone($("#rpPhone").value);
      if (!p) { msg.textContent = "전화번호를 8~15자리 숫자로 입력해 주세요."; return; }
      if (pw.length < 4) { msg.textContent = "새 비밀번호는 4자 이상이어야 해요."; return; }
      if (id === CFG.guest.id) { msg.textContent = "게스트 계정은 재설정할 수 없어요."; return; }
      try {
        const ok = await DB.resetPasswordByPhone(id, await phoneHash(p), await Util.sha256(id + ":" + pw));
        if (!ok) { msg.textContent = "ID 또는 전화번호가 가입 정보와 맞지 않아요."; return; }
        Util.toast("비밀번호를 바꿨어요. 새 비밀번호로 로그인하세요.", "ok");
        $("#lgId").value = id; $("#lgPw").value = ""; $("#rpPw").value = "";
        go("login");
      } catch (err) { console.error(err); msg.textContent = "처리하지 못했어요. 인터넷 연결을 확인해 주세요."; }
    };
  }

  async function restoreSession() {
    try {
      const ses = JSON.parse(localStorage.getItem("hz_session") || "null");
      if (!ses) return;
      if (ses.guest) { enter({ id: ses.id, guest: true }, "guest"); return; }
      const s = await DB.getStudent(ses.id);
      if (s && s.passHash === ses.h) enter(s, "auto");
    } catch (e) { /* 로그인 화면 유지 */ }
  }

  /* ============ 홈 ============ */
  async function enter(s, how) {
    st.user = s;
    if (!s.guest) DB.addLogin(s.id, how || "login");        // 로그인 기록 (게스트 제외)
    $("#guestBanner").classList.toggle("hidden", !s.guest);
    $("#who").textContent = s.guest ? "게스트 체험" : "ID: " + s.id;
    $("#who").classList.remove("hidden"); $("#btnLogout").classList.remove("hidden");
    if (!s.guest) DB.flushPending().then(updateSync);
    show("viewHome");
    await loadProg();
    await loadWords();
  }

  // 연습 진행(회차 수)은 서버에 저장되어 기기를 바꿔도 이어집니다. (기기 저장분과 합쳐 더 큰 값을 사용)
  function localProg() { try { return JSON.parse(localStorage.getItem("hz_prog_" + st.user.id)) || {}; } catch (e) { return {}; } }
  function prog() { return st.progCache || localProg(); }
  function saveProg(p, wordId) {
    st.progCache = p;
    localStorage.setItem("hz_prog_" + st.user.id, JSON.stringify(p));
    if (st.user.guest) return;                // 게스트는 서버에 저장하지 않음
    DB.saveProgress(st.user.id, wordId, p[wordId]).catch(e => console.warn("진행 저장 지연", e));
  }
  async function loadProg() {
    const mine = localProg();
    let remote = {};
    try { if (!st.user.guest) remote = await DB.getProgress(st.user.id); } catch (e) { console.warn(e); }
    const out = Object.assign({}, remote);
    Object.keys(mine).forEach(k => { if (!out[k] || (mine[k].total || 0) > (out[k].total || 0)) out[k] = mine[k]; });
    st.progCache = out;
  }
  function updateSync() {
    const n = DB.pendingCount();
    $("#syncInfo").textContent = n ? `⚠️ 아직 서버에 저장되지 않은 기록이 ${n}건 있어요. 인터넷에 연결되면 자동으로 저장됩니다.` : "";
  }

  async function loadWords() {
    try { st.words = await DB.listWords(); }
    catch (e) { console.error(e); Util.toast("단어 목록을 불러오지 못했어요.", "bad"); st.words = []; }
    const lessons = [...new Set(st.words.map(w => w.lesson))].sort(Util.nat);
    if (!st.lesson || !lessons.includes(st.lesson)) {
      const latest = st.words.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      st.lesson = latest ? latest.lesson : null;
    }
    renderHome(lessons);
  }

  function renderHome(lessons) {
    const chips = $("#lessonChips"); chips.innerHTML = "";
    lessons.forEach(l => {
      const b = document.createElement("button");
      b.className = "chip" + (l === st.lesson ? " on" : ""); b.textContent = l;
      b.onclick = () => { st.lesson = l; renderHome(lessons); };
      chips.appendChild(b);
    });
    const grid = $("#wordGrid"); grid.innerHTML = "";
    const list = st.words.filter(w => w.lesson === st.lesson).sort((a, b) => (a.order || 0) - (b.order || 0));
    $("#noWords").classList.toggle("hidden", st.words.length > 0);
    const P = prog();
    list.forEach(w => {
      const p = P[w.id] || { blank: 0 };
      const d = document.createElement("div");
      d.className = "wcard"; d.tabIndex = 0; d.setAttribute("role", "button");
      d.innerHTML = `${p.blank ? `<span class="badge">빈칸 ${p.blank}회</span>` : ""}
        <div class="hz">${Util.esc(w.word)}</div><div class="py">${Util.esc(w.pinyin)}</div><div class="ko">${Util.esc(w.meaning)}</div>
        <button class="btn sm ghost spk" title="발음 듣기">🔊</button>`;
      d.onclick = () => openWord(w);
      d.onkeydown = e => { if (e.key === "Enter") openWord(w); };
      $(".spk", d).onclick = e => { e.stopPropagation(); TTS.speak(w.word); };
      grid.appendChild(d);
    });
    updateSync();
  }

  /* ============ 연습 ============ */
  $("#btnBack").onclick = () => { abortRound(); show("viewHome"); renderHome([...new Set(st.words.map(w => w.lesson))].sort(Util.nat)); };
  $("#btnSpeak").onclick = () => TTS.speak(st.word.word);
  $$(".stagebtn").forEach(b => b.onclick = () => startRound(b.dataset.mode));
  $("#btnReplay").onclick = () => replayDemo();
  $("#btnUndo").onclick = undo;
  $("#btnClear").onclick = clearChar;
  $("#btnHint").onclick = hint;
  $("#btnNextChar").onclick = () => { if (R && R.cur < R.ents.length - 1) { R.cur++; refreshBoxes(); } };
  $("#btnSubmit").onclick = submit;

  async function openWord(w) {
    abortRound();
    st.word = w;
    show("viewPractice");
    $("#whHz").textContent = ""; $("#whPy").textContent = w.pinyin; $("#whKo").textContent = w.meaning;
    $("#boxes").innerHTML = '<span class="muted">글자 데이터를 불러오는 중…</span>';
    $("#result").classList.add("hidden");
    const chars = [...w.word].filter(Hanzi.isHan);
    const datas = await Promise.all(chars.map(c => Hanzi.load(c)));
    if (datas.some(d => d === undefined)) {
      $("#boxes").innerHTML = '<span class="err">글자 데이터를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 들어와 주세요.</span>';
      return;
    }
    st.chars = []; st.skippedChars = [];
    chars.forEach((c, i) => { if (datas[i]) st.chars.push({ ch: c, data: datas[i] }); else st.skippedChars.push(c); });
    if (!st.chars.length) { $("#boxes").innerHTML = '<span class="err">이 단어는 획순 데이터가 없어 연습할 수 없어요.</span>'; return; }
    if (st.skippedChars.length) Util.toast("획순 데이터가 없는 글자는 건너뛰어요: " + st.skippedChars.join(" "), "warn");
    const p = prog()[w.id] || {};
    startRound(p.trace ? "blank" : "trace");
  }

  function abortRound() {
    CharBox.setSessionLock(false);
    tokenSeq++; stopTimer();
    if (R) R.ents.forEach(e => e.box.stop());
    R = null;
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  async function startRound(mode) {
    abortRound();
    const token = tokenSeq;
    const w = st.word;
    $$(".stagebtn").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
    $("#result").classList.add("hidden");
    $("#whHz").textContent = mode === "trace" ? w.word : "□".repeat(st.chars.length);
    const boxes = $("#boxes");
    boxes.innerHTML = "";
    boxes.style.setProperty("--rows", Math.min(st.chars.length, window.innerWidth >= 700 ? 4 : 2));
    R = { mode, token, ents: [], events: [], log: [], cur: 0, undo: 0, hints: 0, firstPen: null, enabledAt: null, submitted: false, busy: false, skip: false };
    st.chars.forEach((c, i) => {
      const wrap = document.createElement("div");
      wrap.className = "boxwrap";
      boxes.appendChild(wrap);
      const box = new CharBox(wrap, c.data);
      box.setGray(mode === "trace");
      box.onStart = () => { if (!R.firstPen) { R.firstPen = performance.now(); startTimer(); CharBox.setSessionLock(true); } };
      box.onStroke = (pts, path) => onStroke(i, pts, path);
      R.ents.push({ ch: c.ch, data: c.data, box, E: c.data.strokes.length, canvas: [] });
    });
    $("#btnReplay").classList.toggle("hidden", mode !== "trace");
    $("#btnHint").classList.toggle("hidden", false);
    $("#timer").textContent = "⏱ 0.0초";
    $("#dots").innerHTML = "";
    const P = prog()[w.id] || {};
    $("#roundInfo").textContent = mode === "trace" ? "따라쓰기" : `빈칸쓰기 ${(P.blank || 0) + 1}회차 / 권장 ${CFG.targetRounds}회`;
    TTS.speak(w.word);                       // 쓸 때마다 발음 들려주기
    if (mode === "trace") await playDemo(token);
    if (!R || R.token !== token) return;
    R.busy = false;
    R.enabledAt = performance.now();
    refreshBoxes();
    setFb("", mode === "trace" ? "연한 글자를 따라 써 보세요 ✍️" : "기억을 떠올려 빈칸에 써 보세요 ✍️",
      mode === "trace" ? "파란색으로 표시된 획이 다음에 쓸 획이에요." : "막히면 💡 힌트를 눌러 다음 획을 볼 수 있어요.");
  }

  async function playDemo(token) {
    R.busy = true; R.skip = false; refreshBoxes();
    $("#btnReplay").textContent = "⏭ 건너뛰기";
    setFb("ok", "👀 획순을 잘 보세요", "한 획씩 쓰는 순서와 방향을 보여 드려요.");
    for (const e of R.ents) {
      if (!R || R.token !== token || R.skip) break;
      await e.box.play();
    }
    if (R && R.token === token) {
      R.ents.forEach(e => { e.box.stop(); e.box.clearAnim(); });
      $("#btnReplay").textContent = "▶ 획순 다시 보기";
    }
  }
  async function replayDemo() {
    if (!R) return;
    if (R.busy) { R.skip = true; R.ents.forEach(e => e.box.stop()); return; }
    const token = R.token;
    await playDemo(token);
    if (R && R.token === token) { R.busy = false; refreshBoxes(); setFb("", "이어서 따라 써 보세요 ✍️", ""); }
  }

  function firstUnused(ent) {
    const used = new Set(ent.canvas.filter(x => x.matched >= 0).map(x => x.matched));
    for (let i = 0; i < ent.E; i++) if (!used.has(i)) return i;
    return -1;
  }
  function refreshBoxes() {
    if (!R) return;
    const last = R.ents.length - 1;
    R.ents.forEach((e, i) => {
      e.box.setEnabled(!R.submitted && !R.busy && i === R.cur);
      e.box.setDim(!R.submitted && i > R.cur);
      e.box.setNext(R.mode === "trace" && !R.submitted && i === R.cur ? firstUnused(e) : null);
    });
    $("#btnNextChar").classList.toggle("hidden", R.submitted || R.cur >= last);
    $("#btnUndo").disabled = R.submitted || R.busy;
    $("#btnClear").disabled = R.submitted || R.busy;
    $("#btnHint").disabled = R.submitted || R.busy;
    $("#btnSubmit").disabled = R.submitted || R.busy;
  }

  function setFb(sev, title, lines) {
    const el = $("#fb");
    el.className = "fb " + sev;
    const arr = Array.isArray(lines) ? lines : (lines ? [lines] : []);
    el.innerHTML = `<div class="t">${Util.esc(title)}</div>` +
      (arr.length ? `<ul>${arr.map(l => `<li>${Util.esc(l)}</li>`).join("")}</ul>` : "");
  }
  function renderDots() {
    $("#dots").innerHTML = R.events.filter(e => !e.undone).map(e => {
      const sev = e.over || e.unm || e.shp || e.pos || e.siz ? "bad" : (e.ord || e.start ? "warn" : "ok");
      return `<span class="dot ${sev}"></span>`;
    }).join("");
  }

  /* ---- 타이머 ---- */
  function startTimer() {
    stopTimer();
    timerHandle = setInterval(() => {
      if (R && R.firstPen && !R.submitted) $("#timer").textContent = "⏱ " + ((performance.now() - R.firstPen) / 1000).toFixed(1) + "초";
    }, 200);
  }
  function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; }

  /* ============ 한 획 판정 + 즉각 피드백 ============ */
  function onStroke(c, pts, path) {
    if (!R || R.submitted || R.busy || R.cur !== c) { path.remove(); return; }
    const ent = R.ents[c];
    const evt = { c, n: ent.canvas.length + 1, k: 0, m: 0, t: Math.round(performance.now() - R.firstPen), over: 0, ord: 0, start: 0, startKind: "", shp: 0, pos: 0, siz: 0, unm: 0, sim: 0, sd: 0, pd: 0, std: 0, undone: 0 };
    let sev = "ok", title = "", lines = [];
    const sNo = ent.canvas.length + 1;
    let matched = -1;

    if (ent.canvas.length >= ent.E) {
      evt.over = 1; sev = "bad";
      title = `❌ 획수 오류`;
      lines.push(`'${ent.ch}'은(는) ${ent.E}획인데 획이 더 많아요. ↩ 되돌리기로 틀린 획을 지우고 확인해 보세요.`);
    } else {
      const used = new Set(ent.canvas.filter(x => x.matched >= 0).map(x => x.matched));
      const cands = [];
      for (let i = 0; i < ent.E; i++) if (!used.has(i)) cands.push({ idx: i, med: ent.box.meds[i] });
      const k = cands[0].idx;
      const r = Eval.evaluateStroke(pts, cands, k, CFG.leniency);
      matched = r.matched;
      const nameK = Eval.classify(ent.box.meds[k]).ko;
      evt.k = k + 1; evt.m = matched + 1;
      evt.sim = Math.round(r.sim * 10) / 10; evt.sd = Math.round(r.shapeDist); evt.pd = Math.round(r.posDist); evt.std = Math.round(r.startDist);

      if (r.unmatched) {
        evt.unm = 1; sev = "bad"; title = "❌ 자형 오류 (모양)";
        lines.push(`어느 획과도 닮지 않았어요. 지금 써야 할 획은 ${k + 1}번째, ${nameK}이에요.`);
        ent.box.flash(k); ent.box.marker(ent.box.meds[k][0]);
      } else {
        const nameM = Eval.classify(ent.box.meds[matched]).ko;
        let form = false, flow = false, flashIdx = -1, markPt = null;
        if (r.orderErr) {
          evt.ord = 1; flow = true; flashIdx = k;
          lines.push(`획순 오류: 지금 써야 할 획은 ${k + 1}번째, ${nameK}이에요. 방금 쓴 획은 ${matched + 1}번째, ${nameM}이에요.`);
        }
        if (r.startErr) {
          evt.start = 1; evt.startKind = r.startKind; flow = true;
          if (flashIdx < 0) flashIdx = matched;
          markPt = ent.box.meds[flashIdx][0];
          lines.push(r.startKind === "dir"
            ? `시작 위치 오류: 방향이 반대예요. ${Eval.region(ent.box.meds[matched][0])}에서 시작해서 반대쪽으로 쓰세요.`
            : `시작 위치 오류: 이 획은 ${Eval.region(r.expStart)}에서 시작해야 해요.`);
        }
        if (r.shapeBad) {
          evt.shp = 1; form = true; if (flashIdx < 0) flashIdx = matched;
          lines.push(r.userType.id !== r.expType.id
            ? `자형 오류(모양): ${r.expType.ko}처럼 써야 하는데 ${r.userType.ko}처럼 보여요.`
            : `자형 오류(모양): ${r.expType.ko}의 굽은 정도·꺾임이 달라요. 연한 정답 획을 확인해 보세요.`);
        }
        if (r.posErr) {
          evt.pos = 1; form = true; if (flashIdx < 0) flashIdx = matched;
          const dir = Math.abs(r.dx) > Math.abs(r.dy) ? (r.dx > 0 ? "왼쪽" : "오른쪽") : (r.dy > 0 ? "위쪽" : "아래쪽");
          lines.push(`자형 오류(위치): 획이 ${dir}으로 치우쳐 있어요. 칸의 십자선을 기준으로 위치를 맞춰 보세요.`);
        }
        if (r.sizeErr) {
          evt.siz = 1; form = true; if (flashIdx < 0) flashIdx = matched;
          lines.push(`자형 오류(크기): 획이 정답보다 너무 ${r.sizeDir === "long" ? "길어요" : "짧아요"}.`);
        }
        if (flashIdx >= 0) ent.box.flash(flashIdx);
        if (markPt) ent.box.marker(markPt);
        if (form) sev = "bad"; else if (flow) sev = "warn";
        title = sev === "ok" ? `✅ ${sNo}번째 획 · ${nameM} — 좋아요!` : (sev === "warn" ? `⚠️ ${sNo}번째 획에 확인할 점이 있어요` : `❌ ${sNo}번째 획을 다시 확인해 보세요`);
        if (sev !== "ok") lines.push("↩ 되돌리기를 눌러 이 획을 고쳐 써 보세요.");
      }
    }
    path.classList.add(sev === "ok" ? "u-ok" : sev === "warn" ? "u-warn" : "u-bad");
    ent.canvas.push({ path, evt, matched });
    R.events.push(evt);
    if (sev !== "ok") R.log.push(`${c + 1}번째 글자 '${ent.ch}' ${sNo}번째 획: ` + lines.filter(l => !l.startsWith("↩")).join(" / "));
    if (ent.canvas.length >= ent.E && c < R.ents.length - 1) R.cur = c + 1;   // 다음 글자로 (되돌리기로 돌아올 수 있음)
    renderDots(); refreshBoxes();
    setFb(sev, title, lines);
  }

  function undo() {
    if (!R || R.submitted || R.busy) return;
    let c = R.cur;
    if (!R.ents[c].canvas.length && c > 0) c--;
    const ent = R.ents[c];
    const last = ent.canvas.pop();
    if (!last) return;
    last.path.remove(); last.evt.undone = 1; R.undo++;
    R.cur = c;
    ent.box.clearFeedback();
    renderDots(); refreshBoxes();
    setFb("", "↩ 마지막 획을 지웠어요", "다시 써 보세요.");
  }
  function clearChar() {
    if (!R || R.submitted || R.busy) return;
    const ent = R.ents[R.cur];
    if (!ent.canvas.length) return;
    ent.canvas.forEach(x => { x.path.remove(); x.evt.undone = 1; R.undo++; });
    ent.canvas = [];
    ent.box.clearFeedback();
    renderDots(); refreshBoxes();
    setFb("", "🧹 이 글자를 지웠어요", "처음부터 다시 써 보세요.");
  }
  async function hint() {
    if (!R || R.submitted || R.busy) return;
    const ent = R.ents[R.cur];
    const k = firstUnused(ent);
    if (k < 0) { setFb("", "이 글자는 획을 모두 썼어요", "다음 글자로 가거나 채점해 보세요."); return; }
    R.hints++;
    const nm = Eval.classify(ent.box.meds[k]).ko;
    setFb("", `💡 ${k + 1}번째 획은 ${nm}`, `${Eval.region(ent.box.meds[k][0])}에서 시작해요. 애니메이션을 보세요.`);
    ent.box.animateOne(k);
  }

  /* ============ 채점 · 저장 ============ */
  async function submit() {
    if (!R || R.submitted || R.busy) return;
    const total = R.ents.reduce((s, e) => s + e.canvas.length, 0);
    if (!total) { Util.toast("먼저 한 획이라도 써 보세요.", "warn"); return; }
    R.submitted = true; stopTimer(); CharBox.setSessionLock(false);
    const now = performance.now();
    const S = R.ents.reduce((s, e) => s + e.E, 0);
    const missing = R.ents.reduce((s, e) => s + Math.max(0, e.E - e.canvas.length), 0);
    const ev = R.events;
    const over = ev.filter(e => e.over).length;
    const evalEv = ev.filter(e => !e.over);
    const cnt = f => ev.filter(e => e[f]).length;
    const ordErr = cnt("ord"), startErr = cnt("start");
    const formErr = ev.filter(e => e.shp || e.pos || e.siz || e.unm).length;
    const countErr = over + missing;
    const sumSim = evalEv.reduce((s, e) => s + e.sim, 0);
    const pct = n => Math.max(0, Math.min(100, 100 * (1 - n / S)));
    const sc = {
      count: pct(countErr), order: pct(ordErr), start: pct(startErr),
      shape: Math.min(100, sumSim / Math.max(S, evalEv.length))
    };
    const W = CFG.weights;
    const final = sc.count * W.count + sc.order * W.order + sc.start * W.start + sc.shape * W.shape;

    const P = prog(); const w = st.word;
    const p = P[w.id] = P[w.id] || { blank: 0, trace: 0, total: 0, hist: [] };
    const isBlank = R.mode === "blank";
    const round = isBlank ? p.blank + 1 : 0;
    p.total++; if (isBlank) { p.blank++; p.hist.push(Util.round1(final)); } else p.trace++;
    saveProg(P, w.id);
    const prev = isBlank && p.hist.length > 1 ? p.hist[p.hist.length - 2] : null;

    const d = new Date();
    const att = {
      id: Util.uid("a"), studentId: st.user.id, date: Util.today(), time: Util.clock(d), ts: d.getTime(),
      lesson: w.lesson, wordId: w.id, word: w.word, pinyin: w.pinyin, meaning: w.meaning,
      mode: R.mode, round, seq: p.total,
      countErr, missingStrokes: missing, extraStrokes: over,
      orderErr: ordErr, startErr,
      formErr, formShapeErr: ev.filter(e => e.shp || e.unm).length, formPosErr: cnt("pos"), formSizeErr: cnt("siz"),
      durationSec: Util.round1(((R.firstPen ? now - R.firstPen : 0)) / 1000),
      thinkSec: Util.round1(((R.firstPen && R.enabledAt ? R.firstPen - R.enabledAt : 0)) / 1000),
      expectedStrokes: S, drawnStrokes: total, undoCount: R.undo, hintCount: R.hints,
      scoreCount: Util.round1(sc.count), scoreOrder: Util.round1(sc.order), scoreStart: Util.round1(sc.start), scoreShape: Util.round1(sc.shape),
      finalScore: Util.round1(final), leniency: CFG.leniency
    };
    const strokes = ev.map(e => ({ ch: R.ents[e.c].ch, ...e }));
    const ink = Ink.collect(R.ents);          // 학생이 쓴 글씨(획 궤적)

    R.ents.forEach(e => { e.box.setGray(true); e.box.setNext(null); e.box.setEnabled(false); e.box.setDim(false); });
    $("#whHz").textContent = w.word;
    refreshBoxes();
    setFb(final >= 85 ? "ok" : final >= 60 ? "warn" : "bad", `채점 완료: ${att.finalScore}점`, "아래 결과를 확인하세요.");
    renderResult(att, prev);
    TTS.speak(w.word);

    if (st.user.guest) { $("#saveState").textContent = "👀 게스트 체험 모드라서 기록은 저장되지 않아요."; return; }
    DB.addAttempt(att, strokes, ink).then(ok => {
      $("#saveState").textContent = ok ? "✔ 기록이 저장되었어요." : "⚠️ 저장 대기 중 (인터넷에 연결되면 자동 저장)";
      updateSync();
    }).catch(e => { console.error(e); $("#saveState").textContent = "⚠️ 저장 대기 중"; });
  }

  function renderResult(a, prev) {
    const box = $("#result");
    const bar = (label, v) => `<div class="bar"><span>${label}</span><div class="tr"><div class="fi" style="width:${v}%"></div></div><b>${v}</b></div>`;
    const delta = prev == null ? "" : (a.finalScore - prev >= 0 ? `<span class="pill ok">지난 회차 ${prev} → ${a.finalScore} (▲${Util.round1(a.finalScore - prev)})</span>` : `<span class="pill bad">지난 회차 ${prev} → ${a.finalScore} (▼${Util.round1(prev - a.finalScore)})</span>`);
    const p = prog()[st.word.id] || {};
    const nextRound = (p.blank || 0) + 1;
    const pills = [
      ["획수 오류", a.countErr], ["획순 오류", a.orderErr], ["시작 위치 오류", a.startErr],
      ["자형 오류", a.formErr]
    ].map(([n, v]) => `<span class="pill ${v ? "bad" : "ok"}">${n} ${v}</span>`).join("");
    const logs = [...new Set(R.log)].slice(0, 8);
    const tips = [];
    if (a.orderErr) tips.push("획순이 헷갈리면 ① 단계의 애니메이션을 다시 보세요. (위→아래, 왼→오른쪽, 가로→세로 순서가 기본)");
    if (a.startErr) tips.push("획을 시작하는 점이 중요해요. 연한 글자의 획 시작점을 먼저 확인하고 쓰세요.");
    if (a.formErr) tips.push("자형은 모양·위치·크기를 함께 봐요. 칸의 십자선을 기준으로 글자 전체가 칸 안에 고르게 들어가게 써 보세요.");
    if (a.countErr) tips.push(`획수가 정답(${a.expectedStrokes}획)과 달랐어요. 빠뜨리거나 더 쓴 획이 없는지 확인하세요.`);
    box.innerHTML = `
      <h2>${a.mode === "trace" ? "따라쓰기 결과" : `빈칸쓰기 ${a.round}회차 결과`}</h2>
      <div class="row" style="align-items:flex-end"><div class="bigscore">${a.finalScore}<span style="font-size:1.2rem">점</span></div><div>${delta}<div class="muted small">소요 시간 ${a.durationSec}초 · 되돌리기 ${a.undoCount}회 · 힌트 ${a.hintCount}회</div></div></div>
      <div class="bars">${bar("획수", a.scoreCount)}${bar("획순", a.scoreOrder)}${bar("시작 위치", a.scoreStart)}${bar("자형", a.scoreShape)}</div>
      <div>${pills}</div>
      ${logs.length ? `<details open style="margin-top:10px"><summary><b>틀린 부분</b></summary><ul>${logs.map(l => `<li class="small">${Util.esc(l)}</li>`).join("")}</ul></details>` : `<p><b>🎉 모든 획이 정확했어요!</b></p>`}
      ${tips.length ? `<div class="small muted"><b>다음엔 이렇게:</b><ul>${tips.map(t => `<li>${Util.esc(t)}</li>`).join("")}</ul></div>` : ""}
      <p id="saveState" class="small muted">저장 중…</p>
      <div class="row">
        ${a.mode === "trace"
          ? `<button class="btn primary" id="rNext">✍️ 빈칸에 직접 쓰기 ▶</button><button class="btn" id="rAgain">따라쓰기 한 번 더</button>`
          : `<button class="btn primary" id="rNext">🔁 한 번 더 쓰기 (${nextRound}회차)</button><button class="btn" id="rAgain">따라쓰기로 복습</button>`}
        <button class="btn" id="rList">단어 목록</button>
      </div>`;
    box.classList.remove("hidden");
    $("#rNext").onclick = () => startRound("blank");
    $("#rAgain").onclick = () => startRound("trace");
    $("#rList").onclick = () => $("#btnBack").click();
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
})();
