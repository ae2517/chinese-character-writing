/* 교수 화면 */
(() => {
  const P = { words: [], attempts: [], students: [], stuMap: new Map(), rows: [] };
  const charts = {};
  let started = false;
  let draft = [];

  try { DB.init(); } catch (e) { alert(e.message); }
  if (DB.demo) $("#demoBanner").classList.remove("hidden");

  /* ============ 로그인 ============ */
  DB.profWatch(ok => {
    $("#viewLogin").classList.toggle("hidden", ok);
    $("#viewMain").classList.toggle("hidden", !ok);
    $("#btnLogout").classList.toggle("hidden", !ok);
    if (ok) start();
  });
  $("#formLogin").onsubmit = async e => {
    e.preventDefault();
    $("#pfErr").textContent = "";
    try {
      await DB.profLogin($("#pfEmail").value.trim(), $("#pfPw").value);
      if (DB.demo) location.reload();
    } catch (err) {
      $("#pfErr").textContent = DB.demo ? err.message : "로그인에 실패했어요. 이메일/비밀번호를 확인해 주세요.";
    }
  };
  $("#btnLogout").onclick = async () => { await DB.profLogout(); if (DB.demo) location.reload(); };

  $$("#mainTabs .tab").forEach(b => b.onclick = () => {
    $$("#mainTabs .tab").forEach(x => x.classList.toggle("on", x === b));
    $$(".panel").forEach(p => p.classList.toggle("hidden", p.id !== b.dataset.p));
    if (b.dataset.p === "pStats") renderStats();
  });

  async function start() {
    if (started) return; started = true;
    $("#wDate").value = Util.today();
    await loadAll();
  }

  async function loadAll(force) {
    try {
      [P.words, P.students, P.attempts, P.logins] = await Promise.all([DB.listWords(), DB.listStudents(), DB.listAttempts(force), DB.listLogins()]);
    } catch (e) {
      console.error(e);
      Util.toast("데이터를 불러오지 못했어요: " + (e.code || e.message) + " (Firestore 규칙/교수 계정 확인)", "bad");
    }
    P.stuMap = new Map(P.students.map(s => [s.id, s]));
    renderWordList(); buildDataFilters(); renderData(); buildStatFilters(); renderStudents();
  }

  /* ============ ① 단어 등록 ============ */
  async function translateKo(w) {
    try {
      const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(w) + "&langpair=zh-CN|ko");
      const j = await r.json();
      const t = j && j.responseData && j.responseData.translatedText;
      if (t && j.responseStatus == 200 && !/MYMEMORY|INVALID|QUERY LENGTH/i.test(t)) return t;
    } catch (e) { /* 다음 방법 */ }
    try {
      const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=ko&dt=t&q=" + encodeURIComponent(w));
      const j = await r.json();
      return (j[0] || []).map(x => x[0]).join("");
    } catch (e) { return ""; }
  }

  $("#btnAuto").onclick = async () => {
    const tokens = [...new Set($("#wInput").value.split(/[\n,，、;；\s]+/).map(s => s.trim()).filter(Boolean))];
    if (!tokens.length) { Util.toast("단어를 입력해 주세요.", "warn"); return; }
    $("#btnAuto").disabled = true; $("#autoInfo").textContent = "병음·뜻을 만드는 중…";
    draft = await Promise.all(tokens.map(async w => {
      let py = "";
      try { py = window.pinyinPro ? pinyinPro.pinyin(w, { toneType: "symbol" }) : ""; } catch (e) { /* 수동 입력 */ }
      const chars = [...w].filter(Hanzi.isHan);
      const datas = await Promise.all(chars.map(c => Hanzi.load(c)));
      const missing = chars.filter((c, i) => datas[i] === null);
      const net = datas.some(d => d === undefined);
      const strokes = datas.reduce((s, d) => s + (d ? d.strokes.length : 0), 0);
      return { word: w, pinyin: py, meaning: await translateKo(w), chars: chars.length, missing, net, strokes };
    }));
    $("#btnAuto").disabled = false; $("#autoInfo").textContent = "";
    renderDraft();
  };

  function renderDraft() {
    const t = $("#previewTbl");
    t.innerHTML = `<tr><th>단어</th><th>한어병음</th><th>한국어 뜻</th><th>획 데이터</th><th></th></tr>`;
    draft.forEach((d, i) => {
      const status = !d.chars ? '<span class="pill bad">한자 없음</span>' : d.missing.length ? `<span class="pill bad">데이터 없음: ${Util.esc(d.missing.join(""))}</span>`
        : d.net ? '<span class="pill bad">네트워크 오류</span>' : `<span class="pill ok">✔ ${d.strokes}획</span>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td style="font-family:var(--hanzi);font-size:1.3rem">${Util.esc(d.word)}</td>
        <td><input type="text" value="${Util.esc(d.pinyin)}" data-f="pinyin"></td>
        <td><input type="text" value="${Util.esc(d.meaning)}" data-f="meaning"></td><td>${status}</td>
        <td><button class="btn sm danger">삭제</button></td>`;
      $$("input", tr).forEach(inp => inp.oninput = () => { d[inp.dataset.f] = inp.value; });
      $("button", tr).onclick = () => { draft.splice(i, 1); renderDraft(); };
      t.appendChild(tr);
    });
    $("#previewWrap").classList.toggle("hidden", !draft.length);
  }

  $("#btnSaveWords").onclick = async () => {
    const lesson = $("#wLesson").value.trim();
    if (!lesson) { Util.toast("과(Lesson)를 입력해 주세요. 예: 3과", "warn"); $("#wLesson").focus(); return; }
    const ok = draft.filter(d => d.chars && !d.missing.length && !d.net);
    const bad = draft.length - ok.length;
    if (!ok.length) { Util.toast("저장할 수 있는 단어가 없어요.", "warn"); return; }
    if (ok.some(d => !d.meaning.trim() || !d.pinyin.trim()) && !confirm("병음이나 뜻이 비어 있는 단어가 있어요. 그래도 저장할까요?")) return;
    const base = P.words.filter(w => w.lesson === lesson).reduce((m, w) => Math.max(m, w.order || 0), 0);
    const list = ok.map((d, i) => {
      const id = lesson.replace(/[\/\\#?[\]]/g, "-") + "__" + d.word;
      const old = P.words.find(w => w.id === id);
      return { id, lesson, word: d.word, pinyin: d.pinyin.trim(), meaning: d.meaning.trim(), date: $("#wDate").value || Util.today(), createdAt: old ? old.createdAt : Date.now(), order: old ? old.order : base + i + 1 };
    });
    try {
      await DB.saveWords(list);
      Util.toast(`${list.length}개 단어 저장 완료` + (bad ? ` (${bad}개 제외)` : ""), "ok");
      draft = []; $("#wInput").value = ""; renderDraft();
      await loadAll();
    } catch (e) { console.error(e); Util.toast("저장 실패: " + (e.code || e.message), "bad"); }
  };

  function renderWordList() {
    const dl = $("#lessonList"); dl.innerHTML = "";
    [...new Set(P.words.map(w => w.lesson))].sort(Util.nat).forEach(l => { const o = document.createElement("option"); o.value = l; dl.appendChild(o); });
    const box = $("#wordList"); box.innerHTML = "";
    if (!P.words.length) { box.innerHTML = '<p class="muted">아직 등록된 단어가 없어요.</p>'; return; }
    [...new Set(P.words.map(w => w.lesson))].sort(Util.nat).forEach(l => {
      const h = document.createElement("h3"); h.textContent = l; box.appendChild(h);
      const wrap = document.createElement("div"); wrap.className = "tscroll"; wrap.style.maxHeight = "none";
      const t = document.createElement("table"); t.className = "t";
      t.innerHTML = "<tr><th>단어</th><th>병음</th><th>뜻</th><th>수업일</th><th>학습 시도</th><th></th></tr>";
      P.words.filter(w => w.lesson === l).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(w => {
        const n = P.attempts.filter(a => a.wordId === w.id).length;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td style="font-family:var(--hanzi);font-size:1.2rem">${Util.esc(w.word)}</td><td>${Util.esc(w.pinyin)}</td><td>${Util.esc(w.meaning)}</td><td>${Util.esc(w.date || "")}</td><td>${n}</td>
          <td><button class="btn sm">🔊</button> <button class="btn sm danger">삭제</button></td>`;
        const [b1, b2] = $$("button", tr);
        b1.onclick = () => TTS.speak(w.word);
        b2.onclick = async () => {
          if (!confirm(`'${w.word}' 단어를 학생 화면에서 삭제할까요?\n(이미 쌓인 학습 기록은 그대로 남습니다.)`)) return;
          await DB.deleteWord(w.id); await loadAll();
        };
        t.appendChild(tr);
      });
      wrap.appendChild(t); box.appendChild(wrap);
    });
  }

  /* ============ 필터 공통 ============ */
  function mkSelect(id, label, opts, container, onchange, sel) {
    const d = document.createElement("div");
    d.innerHTML = `<label for="${id}">${label}</label><select id="${id}"></select>`;
    container.appendChild(d);
    const s = $("select", d);
    opts.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); });
    if (sel != null) s.value = sel;
    s.onchange = onchange;
    return s;
  }
  const uniq = (arr) => [...new Set(arr)].sort(Util.nat);

  function readFilters(prefix) {
    const v = id => { const e = $("#" + prefix + id); return e ? e.value : ""; };
    return { lesson: v("Lesson"), word: v("Word"), student: v("Student"), mode: v("Mode"), consent: v("Consent"), from: v("From"), to: v("To") };
  }
  function applyFilters(f) {
    return P.attempts.filter(a => {
      if (f.lesson && a.lesson !== f.lesson) return false;
      if (f.word && a.wordId !== f.word) return false;
      if (f.student && a.studentId !== f.student) return false;
      if (f.mode && a.mode !== f.mode) return false;
      if (f.consent === "yes" && !(P.stuMap.get(a.studentId) || {}).consent) return false;
      if (f.from && a.date < f.from) return false;
      if (f.to && a.date > f.to) return false;
      return true;
    });
  }
  function filterBlock(prefix, container, onchange, withDates, defMode) {
    const prev = readFilters(prefix);
    container.innerHTML = "";
    const lessons = uniq(P.attempts.map(a => a.lesson));
    mkSelect(prefix + "Lesson", "과", [["", "전체"], ...lessons.map(l => [l, l])], container, onchange, prev.lesson);
    const ws = new Map(); P.attempts.forEach(a => ws.set(a.wordId, a.lesson + " · " + a.word));
    mkSelect(prefix + "Word", "단어", [["", "전체"], ...[...ws.entries()].sort((a, b) => Util.nat(a[1], b[1]))], container, onchange, prev.word);
    mkSelect(prefix + "Student", "학습자", [["", "전체"], ...uniq(P.attempts.map(a => a.studentId)).map(s => [s, s])], container, onchange, prev.student);
    mkSelect(prefix + "Mode", "연습 유형", [["", "전체"], ["blank", "빈칸쓰기"], ["trace", "따라쓰기"]], container, onchange, prev.mode || defMode || "");
    mkSelect(prefix + "Consent", "연구 동의", [["", "전체"], ["yes", "동의자만"]], container, onchange, prev.consent);
    if (withDates) {
      [["From", "시작일"], ["To", "종료일"]].forEach(([k, l]) => {
        const d = document.createElement("div");
        d.innerHTML = `<label for="${prefix}${k}">${l}</label><input id="${prefix}${k}" type="date">`;
        container.appendChild(d); $("input", d).onchange = onchange; $("input", d).value = prev[k.toLowerCase()] || "";
      });
    }
  }

  /* ============ ② 학습 데이터 ============ */
  function buildDataFilters() { filterBlock("d", $("#dataFilters"), renderData, true, ""); }

  function renderData() {
    const rows = applyFilters(readFilters("d")).sort((a, b) => b.ts - a.ts);
    P.rows = rows;
    const stu = new Set(rows.map(r => r.studentId)), words = new Set(rows.map(r => r.wordId));
    const mean = (f) => { const v = rows.map(f); return v.length ? Util.round1(v.reduce((s, x) => s + x, 0) / v.length) : "-"; };
    $("#dataStat").innerHTML = `<div><span class="muted small">시도 수</span><b>${rows.length}</b></div><div><span class="muted small">학습자</span><b>${stu.size}</b></div>
      <div><span class="muted small">단어</span><b>${words.size}</b></div><div><span class="muted small">평균 최종점수</span><b>${mean(r => r.finalScore)}</b></div>
      <div><span class="muted small">평균 소요시간(초)</span><b>${mean(r => r.durationSec)}</b></div>`;
    const cols = ["학습자ID", "학습날짜", "과", "학습단어", "연습유형", "연습횟수", "획수오류", "획순오류", "획시작위치오류", "자형오류", "소요시간(초)", "획수점수", "획순점수", "획시작위치점수", "자형점수", "최종점수"];
    const t = $("#dataTbl");
    t.innerHTML = "<tr>" + cols.map(c => `<th>${c}</th>`).join("") + "</tr>";
    rows.slice(0, 300).forEach(a => {
      const r = Export.attemptRow(a, P.stuMap.get(a.studentId));
      const tr = document.createElement("tr");
      tr.innerHTML = cols.map(c => `<td>${Util.esc(r[c])}</td>`).join("");
      t.appendChild(tr);
    });
    $("#dataNote").textContent = rows.length > 300 ? `화면에는 최근 300건만 표시합니다. 엑셀 파일에는 모든 행(${rows.length}건)과 학습자 정보·획별 상세가 들어갑니다.` : "엑셀 파일에는 학습자 정보·회차별 요약·획별 상세·변수 설명 시트가 함께 들어갑니다.";
  }

  $("#btnRefresh").onclick = async () => { await loadAll(true); Util.toast("새로 불러왔어요.", "ok"); };
  async function doExport(list, label) {
    if (!list.length) { Util.toast("내려받을 데이터가 없어요.", "warn"); return; }
    try {
      const strokeDocs = await DB.listStrokes();
      Export.download({ attempts: list, students: P.students, strokeDocs, logins: P.logins }, label);
    } catch (e) { console.error(e); Util.toast("엑셀 생성 실패: " + e.message, "bad"); }
  }
  $("#btnXlsxAll").onclick = () => doExport(P.attempts, "전체");
  $("#btnXlsxFilt").onclick = () => doExport(P.rows, "필터결과");

  /* ============ ③ 회차별 변화 ============ */
  function buildStatFilters() { filterBlock("s", $("#statFilters"), renderStats, false, "blank"); }

  function renderStats() {
    const rows = applyFilters(readFilters("s"));
    const by = new Map();
    rows.forEach(a => { if (!by.has(a.round)) by.set(a.round, []); by.get(a.round).push(a); });
    const rounds = [...by.keys()].sort((a, b) => a - b);
    const m = (arr, f) => Util.round1(Util.mean(arr.map(f)));
    const stats = rounds.map(r => { const a = by.get(r); return {
      r, n: a.length, time: m(a, x => x.durationSec), c: m(a, x => x.scoreCount), o: m(a, x => x.scoreOrder), s: m(a, x => x.scoreStart), f: m(a, x => x.scoreShape), fin: m(a, x => x.finalScore),
      ce: m(a, x => x.countErr), oe: m(a, x => x.orderErr), se: m(a, x => x.startErr), fe: m(a, x => x.formErr) }; });

    const t = $("#statTbl");
    t.innerHTML = "<tr><th>연습횟수</th><th>시도 수</th><th>소요시간(초)</th><th>획수 점수</th><th>획순 점수</th><th>시작위치 점수</th><th>자형 점수</th><th>최종 점수</th><th>획수 오류</th><th>획순 오류</th><th>시작위치 오류</th><th>자형 오류</th></tr>" +
      stats.map(s => `<tr><td>${s.r === 0 ? "따라쓰기" : s.r + "회차"}</td><td>${s.n}</td><td>${s.time}</td><td>${s.c}</td><td>${s.o}</td><td>${s.s}</td><td>${s.f}</td><td><b>${s.fin}</b></td><td>${s.ce}</td><td>${s.oe}</td><td>${s.se}</td><td>${s.fe}</td></tr>`).join("");
    if (!stats.length) t.innerHTML = '<tr><td class="muted">해당 조건의 데이터가 없어요.</td></tr>';

    const labels = stats.map(s => s.r === 0 ? "따라쓰기" : s.r + "회차");
    drawChart("chScore", "line", labels, [
      ["획수 점수", stats.map(s => s.c), "#2563eb"], ["획순 점수", stats.map(s => s.o), "#d98a00"],
      ["시작위치 점수", stats.map(s => s.s), "#1f9d55"], ["자형 점수", stats.map(s => s.f), "#8e44ad"], ["최종 점수", stats.map(s => s.fin), "#c0392b"]
    ], "회차별 평균 점수 (0~100)", 100);
    drawChart("chTime", "bar", labels, [["평균 소요시간(초)", stats.map(s => s.time), "#5d6b7c"]], "회차별 평균 소요시간(초)");

    // 학습자별 첫 회차 → 마지막 회차
    const grp = new Map();
    rows.forEach(a => { const k = a.studentId + "|" + a.wordId; if (!grp.has(k)) grp.set(k, []); grp.get(k).push(a); });
    const fmt = (a, b) => `${a} → ${b} (${b - a >= 0 ? "+" : ""}${Util.round1(b - a)})`;
    const pt = $("#perStudentTbl");
    pt.innerHTML = "<tr><th>학습자</th><th>단어</th><th>시도</th><th>최종점수</th><th>획수 점수</th><th>획순 점수</th><th>시작위치 점수</th><th>자형 점수</th><th>소요시간(초)</th></tr>";
    [...grp.values()].sort((a, b) => Util.nat(a[0].studentId, b[0].studentId) || Util.nat(a[0].word, b[0].word)).forEach(arr => {
      arr.sort((a, b) => a.round - b.round || a.ts - b.ts);
      const f = arr[0], l = arr[arr.length - 1];
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${Util.esc(f.studentId)}</td><td>${Util.esc(f.word)}</td><td>${arr.length}</td><td>${fmt(f.finalScore, l.finalScore)}</td><td>${fmt(f.scoreCount, l.scoreCount)}</td><td>${fmt(f.scoreOrder, l.scoreOrder)}</td><td>${fmt(f.scoreStart, l.scoreStart)}</td><td>${fmt(f.scoreShape, l.scoreShape)}</td><td>${fmt(f.durationSec, l.durationSec)}</td>`;
      pt.appendChild(tr);
    });
  }

  function drawChart(id, type, labels, sets, title, max) {
    if (typeof Chart === "undefined") return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($("#" + id), {
      type,
      data: { labels, datasets: sets.map(([label, data, color]) => ({ label, data, borderColor: color, backgroundColor: type === "bar" ? color : color + "33", tension: .25, pointRadius: 4, borderWidth: label === "최종 점수" ? 4 : 2 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: title }, legend: { position: "bottom" } }, scales: { y: { beginAtZero: true, max } } }
    });
  }

  /* ============ ④ 학생 ============ */
  function renderStudents() {
    const t = $("#stuTbl");
    t.innerHTML = "<tr><th>ID</th><th>국적</th><th>성별</th><th>전공</th><th>학년</th><th>중국어(개월)</th><th>한자(개월)</th><th>친숙도</th><th>연구동의</th><th>가입일</th><th>시도 수</th><th>로그인 횟수</th><th>마지막 접속</th><th></th></tr>";
    P.students.sort((a, b) => Util.nat(a.id, b.id)).forEach(s => {
      const n = P.attempts.filter(a => a.studentId === s.id).length;
      const lg = (P.logins || []).filter(l => l.studentId === s.id).sort((a, b) => a.ts - b.ts);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${Util.esc(s.id)}</td><td>${Util.esc(s.nationality)}</td><td>${Util.esc(s.gender)}</td><td>${Util.esc(s.major)}</td><td>${Util.esc(s.grade)}</td><td>${s.chineseMonths}</td><td>${s.hanziMonths}</td><td>${s.familiarity}</td><td>${s.consent ? "동의" : "비동의"}</td><td>${Util.esc(s.createdDate)}</td><td>${n}</td><td>${lg.length}</td><td>${lg.length ? Util.esc(lg[lg.length - 1].date + " " + lg[lg.length - 1].time) : "-"}</td><td><button class="btn sm">비밀번호 초기화</button></td>`;
      $("button", tr).onclick = async () => {
        const pw = prompt(`'${s.id}' 학생의 새 비밀번호(4자 이상)를 입력하세요.`);
        if (!pw) return;
        if (pw.length < 4) { Util.toast("4자 이상이어야 해요.", "warn"); return; }
        try { await DB.updateStudent(s.id, { passHash: await Util.sha256(s.id + ":" + pw) }); Util.toast("초기화했어요. 학생에게 새 비밀번호를 알려 주세요.", "ok"); }
        catch (e) { Util.toast("실패: " + (e.code || e.message), "bad"); }
      };
      t.appendChild(tr);
    });
  }
})();
