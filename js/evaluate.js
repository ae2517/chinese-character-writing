/* 획 단위 채점 엔진
 * 좌표계: 1024x1024 (화면 기준, y는 아래로 증가). 정답 획은 hanzi-writer-data 의 median(중심선)을 사용.
 *
 * 한 획을 쓸 때마다 evaluateStroke() 가 다음을 판정합니다.
 *  - 어떤 정답 획과 가장 닮았는지(= 획순 판정: 지금 써야 할 획이 아니면 '획순 오류')
 *  - 시작 위치/방향 오류  : 획이 시작된 지점이 정답과 멀거나 방향이 반대
 *  - 자형 오류 3종        : 모양(굽음·꺾임), 위치(치우침), 크기(너무 길거나 짧음)
 *  (획수 오류는 student.js 에서: 정답 획수를 넘겨 쓰거나, 채점 시 모자란 경우)
 */
const Eval = (() => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const clamp01 = x => Math.max(0, Math.min(1, x));

  function pathLen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; }

  function resample(p, n) {
    const L = pathLen(p);
    if (p.length === 1 || L < 1e-6) return Array.from({ length: n }, () => [p[0][0], p[0][1]]);
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + dist(p[i - 1], p[i]));
    const out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const t = (L * k) / (n - 1);
      while (j < p.length - 1 && cum[j] < t) j++;
      const seg = cum[j] - cum[j - 1] || 1;
      const f = clamp01((t - cum[j - 1]) / seg);
      out.push([p[j - 1][0] + f * (p[j][0] - p[j - 1][0]), p[j - 1][1] + f * (p[j][1] - p[j - 1][1])]);
    }
    return out;
  }

  function smooth(p) {
    if (p.length < 4) return p;
    return p.map((q, i) => (i === 0 || i === p.length - 1) ? q
      : [(p[i - 1][0] + q[0] + p[i + 1][0]) / 3, (p[i - 1][1] + q[1] + p[i + 1][1]) / 3]);
  }
  const meanDist = (A, B) => A.reduce((s, a, i) => s + dist(a, B[i]), 0) / A.length;
  function centroid(P) {
    let x = 0, y = 0;
    P.forEach(p => { x += p[0]; y += p[1]; });
    return [x / P.length, y / P.length];
  }
  const centered = P => { const c = centroid(P); return P.map(p => [p[0] - c[0], p[1] - c[1]]); };
  const angle = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  function norm180(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a; }

  /* 획 종류(한국어 이름) */
  function classify(med) {
    const L = pathLen(med);
    if (L < 160) return { id: "dot", ko: "점(点)" };
    const R = resample(med, 12);
    const d1 = angle(R[0], R[4]), d2 = angle(R[7], R[11]);
    if (Math.abs(norm180(d2 - d1)) > 55) return { id: "bend", ko: "꺾이는 획(折)" };
    const a = angle(med[0], med[med.length - 1]);
    if (Math.abs(a) <= 25) return { id: "h", ko: "가로획(横)" };
    if (a > 25 && a < 65) return { id: "na", ko: "오른쪽 아래로 누르는 획(捺)" };
    if (a >= 65 && a <= 105) return { id: "v", ko: "세로획(竖)" };
    if (a > 105 || a < -150) return { id: "pie", ko: "왼쪽 아래로 삐치는 획(撇)" };
    if (a < -25 && a >= -65) return { id: "ti", ko: "오른쪽 위로 치키는 획(提)" };
    return { id: "other", ko: "획" };
  }

  /* 칸 안의 대략적 위치를 말로 */
  function region(pt) {
    const h = pt[0] < 340 ? "왼쪽" : pt[0] > 684 ? "오른쪽" : "가운데";
    const v = pt[1] < 340 ? "위" : pt[1] > 684 ? "아래" : "가운데";
    if (h === "가운데" && v === "가운데") return "칸의 가운데";
    if (h === "가운데") return v + "쪽";
    if (v === "가운데") return h;
    return h + " " + v;
  }

  /**
   * @param userPts  사용자가 쓴 점들 [[x,y],...]
   * @param cands    아직 쓰지 않은 정답 획들 [{idx, med:[[x,y]...]}]  (idx 오름차순)
   * @param k        지금 써야 할 정답 획 번호(0부터)
   * @param lenient  관대함 배수
   */
  function evaluateStroke(userPts, cands, k, lenient) {
    const Lz = lenient || 1;
    userPts = smooth(smooth(userPts));          // 손떨림 잡음 완화
    const uLen = pathLen(userPts);
    const U = resample(userPts, 24);
    const uC = centroid(U);

    const scored = cands.map(c => {
      const E = resample(c.med, 24);
      const Er = E.slice().reverse();
      const f = meanDist(U, E), r = meanDist(U, Er);
      const eLen = pathLen(c.med);
      const rev = eLen >= 120 && r < f * 0.8;
      return { idx: c.idx, med: c.med, E, Er, eLen, d: Math.min(f, r), rev };
    });
    const exp = scored.find(s => s.idx === k) || scored[0];
    const best = scored.slice().sort((a, b) => a.d - b.d)[0];
    // 지금 써야 할 획과 비슷하게 맞으면 그 획으로 인정 (손글씨 오차 허용)
    const pick = exp.d <= best.d + 45 * Lz ? exp : best;
    const matched = pick.d <= 240 * Lz;

    const res = {
      matched: matched ? pick.idx : -1,
      orderErr: false, startErr: false, startKind: "", shapeBad: false, posErr: false, sizeErr: false, sizeDir: "",
      unmatched: !matched, shapeDist: 0, posDist: 0, startDist: 0, sizeRatio: 0, sim: 0, d: pick.d,
      dx: 0, dy: 0, userType: classify(userPts), expType: matched ? classify(pick.med) : null
    };
    if (!matched) return res;

    const Eo = pick.rev ? pick.Er : pick.E;
    const eC = centroid(Eo);
    res.orderErr = pick.idx !== k;
    res.shapeDist = meanDist(centered(U), centered(Eo));
    res.posDist = dist(uC, eC);
    res.startDist = dist(U[0], pick.E[0]);
    res.sizeRatio = pick.eLen > 0 ? uLen / pick.eLen : 1;
    res.dx = eC[0] - uC[0];
    res.dy = eC[1] - uC[1];

    res.shapeBad = res.shapeDist > 120 * Lz;
    res.posErr = res.posDist > 170 * Lz;
    if (pick.eLen >= 150) {
      if (res.sizeRatio < 0.55 / Lz) { res.sizeErr = true; res.sizeDir = "short"; }
      else if (res.sizeRatio > 1.7 * Lz) { res.sizeErr = true; res.sizeDir = "long"; }
    } else if (Math.abs(uLen - pick.eLen) > 160 * Lz) {
      res.sizeErr = true; res.sizeDir = uLen > pick.eLen ? "long" : "short";
    }
    // 시작 위치: 방향이 반대이거나, (전체가 통째로 밀린 게 아닌데) 시작점이 다른 경우
    if (pick.rev) { res.startErr = true; res.startKind = "dir"; }
    else if (!res.posErr && res.startDist > 150 * Lz) { res.startErr = true; res.startKind = "start"; }

    // 획 하나의 자형 유사도(0~100): 모양 50% + 위치 25% + 크기 25%
    const q = res.sizeRatio >= 1 ? 1 / res.sizeRatio : res.sizeRatio;
    const sShape = clamp01(1 - res.shapeDist / (200 * Lz));
    const sPos = clamp01(1 - res.posDist / (300 * Lz));
    const sSize = clamp01((q + (Lz - 1) * 0.4) / (1 + (Lz - 1) * 0.4));
    res.sim = 100 * (0.5 * sShape + 0.25 * sPos + 0.25 * sSize);
    res.expStart = pick.E[0];
    return res;
  }

  return { evaluateStroke, classify, region, pathLen };
})();

window.Eval = Eval;
