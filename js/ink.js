/* 학생이 쓴 글씨(필기) 이미지: 획 궤적(SVG 경로)으로 저장하고, 필요할 때 이미지(SVG/PNG)로 그려 냅니다.
 * 저장 형태(ink): [{ ch, E, p: [{ d: "M.. Q..", s: 0|1|2 }] }]  — 글자별, 획별 경로와 판정 상태(0 정상, 1 순서/시작, 2 자형/획수) */
const Ink = (() => {
  const CELL = 1024, GAP = 60;

  /** 저장용으로 경로 문자열의 소수점을 줄입니다(용량 절약). 한 자리 정수 소수(0.1)는 그대로 둡니다. */
  function compactPath(d) { return d.replace(/(\d{2,})\.\d+/g, "$1"); }

  function collect(ents) {
    return ents.map(e => ({
      ch: e.ch, E: e.E,
      p: e.canvas.map(x => ({
        d: compactPath(x.path.getAttribute("d")),
        s: x.path.classList.contains("u-bad") ? 2 : x.path.classList.contains("u-warn") ? 1 : 0
      }))
    }));
  }

  /** ink → SVG 문자열.  opts: { color: 판정색 표시, answer: 정답 글자 연하게 겹침, bg: 배경 흰색 } */
  async function svg(ink, opts = {}) {
    const n = ink.length, W = n * CELL + (n - 1) * GAP;
    const colors = ["#1f2937", "#d98a00", "#d63031"];
    let body = opts.bg === false ? "" : `<rect width="${W}" height="${CELL}" fill="#fff"/>`;
    for (let i = 0; i < n; i++) {
      const ox = i * (CELL + GAP), c = ink[i];
      body += `<g transform="translate(${ox},0)">`;
      body += `<rect width="${CELL}" height="${CELL}" fill="none" stroke="#b8c2ce" stroke-width="6"/>`;
      body += `<line x1="512" y1="0" x2="512" y2="${CELL}" stroke="#c5ced9" stroke-width="4" stroke-dasharray="22 18"/>`;
      body += `<line x1="0" y1="512" x2="${CELL}" y2="512" stroke="#c5ced9" stroke-width="4" stroke-dasharray="22 18"/>`;
      if (opts.answer && window.Hanzi) {
        const data = await Hanzi.load(c.ch);
        if (data) body += `<g transform="scale(1,-1) translate(0,-900)" fill="#e3e7ec">${data.strokes.map(d => `<path d="${d}"/>`).join("")}</g>`;
      }
      body += `<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="34">` +
        c.p.map(s => `<path d="${s.d}" stroke="${opts.color ? colors[s.s] : colors[0]}"/>`).join("") + `</g></g>`;
    }
    return { markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${CELL}" width="${W}" height="${CELL}">${body}</svg>`, w: W, h: CELL };
  }

  /** SVG 문자열 → PNG Blob */
  function toPng(markup, w, h, scale = 0.5) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        const g = cv.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(b => (b ? resolve(b) : reject(new Error("PNG 변환 실패"))), "image/png");
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지 로드 실패")); };
      img.src = url;
    });
  }

  return { collect, svg, toPng };
})();
window.Ink = Ink;
