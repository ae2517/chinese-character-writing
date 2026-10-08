/* 데이터 계층: Firebase(Firestore, npm 모듈러 SDK) 사용, 설정이 없으면 데모 모드(localStorage) */
import { firebaseEnabled, db as fs, auth } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, serverTimestamp
} from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

const DB = (() => {
  const demo = !firebaseEnabled;

  const L = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  };

  function init() { /* Firebase 초기화는 firebase.js 에서 완료됨 */ }

  /* ---------- 학생 ---------- */
  async function getStudent(id) {
    if (demo) return L.get("demo_students", {})[id] || null;
    const d = await getDoc(doc(fs, "students", id));
    return d.exists() ? d.data() : null;
  }
  // 전화번호는 원문을 저장하지 않고 해시만 저장합니다.
  //  students/{id}            : 공개 조회(로그인용) — 전화번호 정보 없음
  //  studentPrivate/{id}      : 전화번호 해시 (교수 외 읽기 불가)
  //  phoneIndex/{해시}         : 전화번호 → ID (아이디 찾기용, 해시를 알아야만 조회 가능)
  async function createStudent(s, phoneHash) {
    if (demo) {
      const all = L.get("demo_students", {});
      if (all[s.id]) throw new Error("exists");
      const idx = L.get("demo_phoneidx", {});
      if (idx[phoneHash]) throw new Error("phone-exists");
      all[s.id] = s; idx[phoneHash] = s.id;
      L.set("demo_students", all); L.set("demo_phoneidx", idx);
      const pr = L.get("demo_private", {}); pr[s.id] = phoneHash; L.set("demo_private", pr);
      return;
    }
    if ((await getDoc(doc(fs, "phoneIndex", phoneHash))).exists()) throw new Error("phone-exists");
    const batch = writeBatch(fs);
    batch.set(doc(fs, "students", s.id), s);             // 이미 있으면 규칙에서 거부됨
    batch.set(doc(fs, "studentPrivate", s.id), { phoneHash });
    batch.set(doc(fs, "phoneIndex", phoneHash), { studentId: s.id });
    await batch.commit();
  }
  async function findIdByPhone(phoneHash) {
    if (demo) return L.get("demo_phoneidx", {})[phoneHash] || null;
    const x = await getDoc(doc(fs, "phoneIndex", phoneHash));
    return x.exists() ? x.data().studentId : null;
  }
  /** 전화번호가 가입 때와 같으면 비밀번호를 바꿉니다. 맞으면 true, 틀리면 false */
  async function resetPasswordByPhone(id, phoneHash, newPassHash) {
    if (demo) {
      const pr = L.get("demo_private", {});
      if (!pr[id] || pr[id] !== phoneHash) return false;
      const all = L.get("demo_students", {}); all[id].passHash = newPassHash; L.set("demo_students", all);
      return true;
    }
    try {
      const batch = writeBatch(fs);
      // 같은 요청 안에서 '전화번호를 안다'는 증거(resetAt = 요청 시각)를 함께 써야 규칙이 비밀번호 변경을 허용
      batch.update(doc(fs, "studentPrivate", id), { phoneHash, resetAt: serverTimestamp() });
      batch.update(doc(fs, "students", id), { passHash: newPassHash });
      await batch.commit();
      return true;
    } catch (e) {
      if (e && (e.code === "permission-denied" || e.code === "not-found")) return false;
      throw e;
    }
  }
  async function listStudents() {
    if (demo) return Object.values(L.get("demo_students", {}));
    const q = await getDocs(collection(fs, "students"));
    return q.docs.map(d => d.data());
  }
  async function updateStudent(id, patch) {
    if (demo) {
      const all = L.get("demo_students", {});
      all[id] = Object.assign(all[id] || {}, patch);
      L.set("demo_students", all);
      return;
    }
    await updateDoc(doc(fs, "students", id), patch);
  }

  /* ---------- 단어 ---------- */
  async function listWords() {
    if (demo) return L.get("demo_words", []);
    const q = await getDocs(collection(fs, "words"));
    return q.docs.map(d => d.data());
  }
  async function saveWords(list) {
    if (demo) {
      const all = L.get("demo_words", []);
      list.forEach(w => {
        const i = all.findIndex(x => x.id === w.id);
        if (i >= 0) all[i] = w; else all.push(w);
      });
      L.set("demo_words", all);
      return;
    }
    const batch = writeBatch(fs);
    list.forEach(w => batch.set(doc(fs, "words", w.id), w));
    await batch.commit();
  }
  async function deleteWord(id) {
    if (demo) {
      L.set("demo_words", L.get("demo_words", []).filter(w => w.id !== id));
      return;
    }
    await deleteDoc(doc(fs, "words", id));
  }

  /* ---------- 학습 기록 (시도) ---------- */
  // 저장 실패(네트워크 등)에 대비해 기기에 임시 보관했다가 재전송
  function pending() { return L.get("pending_attempts", []); }

  async function writeOne(item) {
    const { att, strokes, ink } = item;
    if (demo) {
      const a = L.get("demo_attempts", []); a.push(att); L.set("demo_attempts", a);
      const s = L.get("demo_strokes", []); s.push({ id: att.id, studentId: att.studentId, strokes, ink }); L.set("demo_strokes", s);
      return;
    }
    const batch = writeBatch(fs);
    batch.set(doc(fs, "attempts", att.id), att);
    batch.set(doc(fs, "attemptStrokes", att.id), { id: att.id, studentId: att.studentId, ts: att.ts, strokes, ink });
    await batch.commit();
  }

  async function flushPending() {
    let q = pending();
    if (!q.length) return { saved: 0, left: 0 };
    let saved = 0;
    const rest = [];
    for (const item of q) {
      try { await writeOne(item); saved++; }
      catch (e) {
        if (e && e.code === "permission-denied") { console.warn("저장 거부(이미 저장됨이거나 규칙 문제):", item.att.id); }
        else rest.push(item);
      }
    }
    L.set("pending_attempts", rest);
    return { saved, left: rest.length };
  }

  async function addAttempt(att, strokes, ink) {
    const q = pending();
    q.push({ att, strokes, ink });
    L.set("pending_attempts", q);
    const r = await flushPending();
    return r.left === 0;
  }

  // 교수용: 증분 로딩 (새로 생긴 것만 추가로 읽어 읽기 횟수 절약)
  const cache = { attempts: [], last: 0, strokes: null };
  async function listAttempts(force) {
    if (force) { cache.attempts = []; cache.last = 0; cache.strokes = null; }
    if (demo) { cache.attempts = L.get("demo_attempts", []); return cache.attempts; }
    const q = await getDocs(query(collection(fs, "attempts"), orderBy("ts"), where("ts", ">", cache.last)));
    q.docs.forEach(d => cache.attempts.push(d.data()));
    if (cache.attempts.length) cache.last = cache.attempts[cache.attempts.length - 1].ts;
    return cache.attempts;
  }
  async function listStrokes() {
    if (demo) return L.get("demo_strokes", []);
    if (cache.strokes) return cache.strokes;
    const q = await getDocs(collection(fs, "attemptStrokes"));
    cache.strokes = q.docs.map(d => d.data());
    return cache.strokes;
  }

  /* ---------- 연습 진행(회차) · 로그인 기록 ---------- */
  async function getProgress(sid) {
    if (demo) return L.get("demo_progress", {})[sid] || {};
    const q = await getDocs(query(collection(fs, "progress"), where("studentId", "==", sid)));
    const out = {};
    q.docs.forEach(d => { const x = d.data(); out[x.wordId] = x; });
    return out;
  }
  async function saveProgress(sid, wordId, p) {
    if (!p) return;
    const docData = Object.assign({}, p, { studentId: sid, wordId, updatedAt: Date.now() });
    if (demo) { const all = L.get("demo_progress", {}); (all[sid] = all[sid] || {})[wordId] = docData; L.set("demo_progress", all); return; }
    await setDoc(doc(fs, "progress", sid + "__" + wordId), docData);
  }
  async function addLogin(sid, type) {
    const now = new Date();
    const rec = { id: Util.uid("l"), studentId: sid, type, ts: now.getTime(), date: Util.today(), time: Util.clock(now), device: (navigator.userAgent || "").slice(0, 120) };
    try {
      if (demo) { const a = L.get("demo_logins", []); a.push(rec); L.set("demo_logins", a); return; }
      await setDoc(doc(fs, "logins", rec.id), rec);
    } catch (e) { console.warn("로그인 기록 실패", e); }
  }
  async function listLogins() {
    if (demo) return L.get("demo_logins", []);
    const q = await getDocs(collection(fs, "logins"));
    return q.docs.map(d => d.data());
  }

  /* ---------- 교수 로그인 ---------- */
  async function profLogin(email, pw) {
    if (demo) {
      if (pw !== "demo") throw new Error("데모 모드에서는 비밀번호가 demo 입니다.");
      L.set("demo_prof", true);
      return;
    }
    await signInWithEmailAndPassword(auth, email, pw);
  }
  function profWatch(cb) {
    if (demo) { cb(!!L.get("demo_prof", false)); return; }
    onAuthStateChanged(auth, u => cb(!!u, u));
  }
  async function profLogout() {
    if (demo) { L.set("demo_prof", false); return; }
    await signOut(auth);
  }

  return {
    demo, init, getStudent, createStudent, findIdByPhone, resetPasswordByPhone, listStudents, updateStudent,
    listWords, saveWords, deleteWord,
    addAttempt, flushPending, pendingCount: () => pending().length,
    getProgress, saveProgress, addLogin, listLogins,
    listAttempts, listStrokes, profLogin, profWatch, profLogout
  };
})();

window.DB = DB;
