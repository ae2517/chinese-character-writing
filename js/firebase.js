/* Firebase 초기화 (npm 모듈러 SDK). 설정값은 js/config.js 의 firebase 칸에서 읽습니다. */
import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const cfg = (window.APP_CONFIG || {}).firebase || {};

// apiKey/projectId 가 없으면 데모 모드(null) — db.js 가 localStorage 로 동작
export const firebaseEnabled = !!(cfg.apiKey && cfg.projectId);

let app = null, db = null, auth = null;
if (firebaseEnabled) {
  app = initializeApp(cfg);
  // 학교/기관 네트워크에서 WebSocket 이 막혀도 동작하도록 롱폴링 자동 감지
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  auth = getAuth(app);
}
export { app, db, auth };
