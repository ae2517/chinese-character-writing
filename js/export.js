/* 엑셀(.xlsx) 내보내기 + 표 행 만들기 */
const Export = (() => {
  const modeKo = m => (m === "trace" ? "따라쓰기" : "빈칸쓰기");

  /** 시도 1건 → 한 행 (학습자 정보 포함, 통계 분석용 long format) */
  function attemptRow(a, s) {
    s = s || {};
    return {
      "학습자ID": a.studentId, "학습날짜": a.date, "학습시각": a.time, "과": a.lesson, "학습단어": a.word, "병음": a.pinyin, "뜻": a.meaning,
      "연습유형": modeKo(a.mode), "연습횟수": a.round, "전체순번": a.seq,
      "획수오류": a.countErr, "획순오류": a.orderErr, "획시작위치오류": a.startErr, "자형오류": a.formErr,
      "자형오류_모양": a.formShapeErr, "자형오류_위치": a.formPosErr, "자형오류_크기": a.formSizeErr,
      "소요시간(초)": a.durationSec, "첫획까지시간(초)": a.thinkSec,
      "정답획수": a.expectedStrokes, "쓴획수": a.drawnStrokes, "빠진획수": a.missingStrokes, "초과획수": a.extraStrokes,
      "되돌리기횟수": a.undoCount, "획순다시보기횟수": a.replayCount ?? "", "다음획힌트횟수": a.hintCount,
      "획수점수": a.scoreCount, "획순점수": a.scoreOrder, "획시작위치점수": a.scoreStart, "자형점수": a.scoreShape, "최종점수": a.finalScore,
      "국적": s.nationality ?? "", "성별": s.gender ?? "", "전공": s.major ?? "", "학년": s.grade ?? "",
      "중국어학습기간(개월)": s.chineseMonths ?? "", "한자학습기간(개월)": s.hanziMonths ?? "", "한자친숙도(1-5)": s.familiarity ?? "",
      "연구동의": s.consent === true ? "동의" : s.consent === false ? "비동의" : "",
      "시도ID": a.id
    };
  }

  function summaryRows(attempts) {
    const g = new Map();
    attempts.forEach(a => {
      const key = [a.lesson, a.word, a.mode, a.round].join("|");
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(a);
    });
    const m = (arr, f) => { const v = arr.map(f); return Util.round1(v.reduce((s, x) => s + x, 0) / v.length); };
    return [...g.entries()].map(([k, arr]) => ({
      "과": arr[0].lesson, "학습단어": arr[0].word, "연습유형": modeKo(arr[0].mode), "연습횟수": arr[0].round, "시도수(N)": arr.length,
      "평균소요시간(초)": m(arr, a => a.durationSec),
      "평균획순다시보기횟수": m(arr, a => a.replayCount || 0), "평균다음획힌트횟수": m(arr, a => a.hintCount || 0), "평균획수오류": m(arr, a => a.countErr), "평균획순오류": m(arr, a => a.orderErr),
      "평균획시작위치오류": m(arr, a => a.startErr), "평균자형오류": m(arr, a => a.formErr),
      "평균획수점수": m(arr, a => a.scoreCount), "평균획순점수": m(arr, a => a.scoreOrder),
      "평균획시작위치점수": m(arr, a => a.scoreStart), "평균자형점수": m(arr, a => a.scoreShape), "평균최종점수": m(arr, a => a.finalScore)
    })).sort((a, b) => Util.nat(a["과"], b["과"]) || Util.nat(a["학습단어"], b["학습단어"]) || Util.nat(a["연습유형"], b["연습유형"]) || a["연습횟수"] - b["연습횟수"]);
  }

  function strokeRows(attempts, strokeDocs) {
    const idx = new Map(attempts.map(a => [a.id, a]));
    const rows = [];
    strokeDocs.forEach(d => {
      const a = idx.get(d.id);
      if (!a) return;
      (d.strokes || []).forEach(s => rows.push({
        "시도ID": a.id, "학습자ID": a.studentId, "학습날짜": a.date, "과": a.lesson, "학습단어": a.word,
        "연습유형": modeKo(a.mode), "연습횟수": a.round,
        "글자": s.ch, "글자내_쓴순서": s.n, "그때_써야할획": s.k, "인식된정답획": s.m,
        "획수초과": s.over, "획순오류": s.ord, "시작위치오류": s.start, "시작오류유형": s.startKind === "dir" ? "방향반대" : s.startKind === "start" ? "시작점다름" : "",
        "자형_모양오류": s.shp, "자형_위치오류": s.pos, "자형_크기오류": s.siz, "어느획과도닮지않음": s.unm,
        "획유사도(0-100)": s.sim, "모양거리": s.sd, "위치거리": s.pd, "시작점거리": s.std,
        "첫획시작후_경과(ms)": s.t, "나중에_되돌림": s.undone
      }));
    });
    return rows;
  }

  const codebook = () => {
    const W = APP_CONFIG.weights;
    return [
      ["시트", "설명"],
      ["시도별_데이터", "한 번 쓴 것(시도) = 한 행. 학습자 정보가 함께 붙어 있어 바로 통계 분석(SPSS/R/Excel)에 쓸 수 있습니다."],
      ["회차별_요약", "과·단어·연습유형·연습횟수별 평균(1회차→5회차 변화 비교용)."],
      ["획별_상세", "시도 안의 획 하나하나의 판정 기록."],
      ["학습자_정보", "가입 시 입력한 학습자 정보. (전화번호는 저장하지 않음 — 본인 확인용 해시만 별도 보관)"],
      ["필기 이미지", "엑셀에는 들어 있지 않습니다. 교수 화면 > 학습 데이터 > '필기 이미지 ZIP' 으로 PNG 를 내려받으세요. 파일명의 시도ID 5자리로 시도별_데이터와 연결됩니다."],
      ["로그인기록", "학생별 접속(로그인·가입·자동로그인) 시각과 기기 정보."],
      [],
      ["변수", "정의"],
      ["연습유형", "따라쓰기(연한 회색 글자 따라 쓰기) / 빈칸쓰기(기억으로 쓰기)"],
      ["연습횟수", "빈칸쓰기 회차(1,2,3…). 따라쓰기는 0으로 기록. 전체순번은 유형 구분 없이 단어별 누적 순번."],
      ["획수오류", "정답 획수를 넘겨 쓴 횟수 + 채점 시점에 모자란 획 수"],
      ["획순오류", "지금 써야 할 획이 아닌 다른 획을 먼저 쓴 횟수(쓴 직후 '되돌리기'로 고쳐도 오류로 기록)"],
      ["획시작위치오류", "획의 시작점이 정답과 많이 다르거나 방향이 반대인 획의 수"],
      ["자형오류", "모양(굽음·꺾임), 위치(치우침), 크기(너무 길거나 짧음) 중 하나라도 틀린 획의 수 / 어느 획과도 닮지 않은 획 포함"],
      ["획수점수", "100 × (1 − 획수오류 / 정답 총획수)"],
      ["획순점수", "100 × (1 − 획순오류 / 정답 총획수)"],
      ["획시작위치점수", "100 × (1 − 획시작위치오류 / 정답 총획수)"],
      ["자형점수", "각 획의 자형 유사도(모양 50% + 위치 25% + 크기 25%)의 평균. 못 쓴 획은 0점으로 계산"],
      ["최종점수", `획수 ${W.count} + 획순 ${W.order} + 획시작위치 ${W.start} + 자형 ${W.shape} 가중 평균 (시도마다 계산)`],
      ["획순다시보기횟수", "따라쓰기 화면에서 '▶ 획순 다시 보기'를 눌러 애니메이션을 다시 본 횟수(처음 자동 재생과 '건너뛰기'는 제외). 빈칸쓰기에서는 이 버튼이 없어 0. 이 기능 추가 전 기록은 빈칸."],
      ["다음획힌트횟수", "'💡 다음 획 힌트'를 눌러 다음 획의 애니메이션을 본 횟수"],
      ["소요시간(초)", "첫 획을 쓰기 시작한 순간부터 '채점' 버튼을 누를 때까지"],
      ["첫획까지시간(초)", "쓰기 화면이 열린 후 첫 획을 쓰기 시작할 때까지(생각 시간)"],
      ["채점 관대함", `leniency = ${APP_CONFIG.leniency} (config.js)`],
      ["한자친숙도", "자기평가 1(전혀 친숙하지 않다)~5(매우 친숙하다)"],
      ["연구동의", "동의 / 비동의 — 연구 분석에는 '동의'만 사용하세요."]
    ];
  };

  function build({ attempts, students, strokeDocs, logins }) {
    const stuMap = new Map(students.map(s => [s.id, s]));
    const wb = XLSX.utils.book_new();
    const rows = attempts.slice().sort((a, b) => a.ts - b.ts).map(a => attemptRow(a, stuMap.get(a.studentId)));
    const add = (name, data, isAoa) => {
      const ws = isAoa ? XLSX.utils.aoa_to_sheet(data) : XLSX.utils.json_to_sheet(data);
      if (!isAoa && data.length) ws["!cols"] = Object.keys(data[0]).map(k => ({ wch: Math.max(8, Math.min(24, k.length * 1.6 + 2)) }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add("시도별_데이터", rows.length ? rows : [{ 안내: "데이터 없음" }]);
    const sum = summaryRows(attempts);
    add("회차별_요약", sum.length ? sum : [{ 안내: "데이터 없음" }]);
    if (strokeDocs) { const sr = strokeRows(attempts, strokeDocs); add("획별_상세", sr.length ? sr : [{ 안내: "데이터 없음" }]); }
    const stu = students.map(s => ({
      "학습자ID": s.id, "국적": s.nationality, "성별": s.gender, "전공": s.major, "학년": s.grade,
      "중국어학습기간(개월)": s.chineseMonths, "한자학습기간(개월)": s.hanziMonths, "한자친숙도(1-5)": s.familiarity,
      "연구동의": s.consent ? "동의" : "비동의", "동의일시": s.consentAt, "동의서버전": s.consentVersion, "가입일": s.createdDate
    }));
    add("학습자_정보", stu.length ? stu : [{ 안내: "데이터 없음" }]);
    if (logins) {
      const lr = logins.slice().sort((a, b) => a.ts - b.ts).map(l => ({ "학습자ID": l.studentId, "접속날짜": l.date, "접속시각": l.time, "구분": l.type === "signup" ? "가입" : l.type === "auto" ? "자동로그인" : "로그인", "기기정보": l.device }));
      add("로그인기록", lr.length ? lr : [{ 안내: "데이터 없음" }]);
    }
    add("변수설명", codebook(), true);
    return wb;
  }

  function download(opts, label) {
    const wb = build(opts);
    XLSX.writeFile(wb, `간화자쓰기_${label || "전체"}_${Util.today().replace(/-/g, "")}.xlsx`);
  }

  return { attemptRow, summaryRows, build, download, modeKo };
})();

window.Export = Export;
