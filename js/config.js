/* ============================================================
 *  앱 설정 파일  (여기만 고치면 됩니다)
 *  - firebase 칸이 비어 있으면 '데모 모드'(이 기기에만 저장)로 동작합니다.
 *  - 실제 수업에서는 README.md 의 안내대로 Firebase 설정값을 붙여 넣으세요.
 * ============================================================ */
// (모듈로 가장 먼저 실행되어 window.APP_CONFIG 를 만듭니다)
window.APP_CONFIG = {
  // ① Firebase 웹 앱 설정값 (Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성)
  firebase: {
    apiKey: "AIzaSyCm3JApEPNEgwNxR4s-BSm8vqyjd8TepeQ",
    authDomain: "chinese-character-writing.firebaseapp.com",
    projectId: "chinese-character-writing",
    appId: "1:26719573465:web:e8274e6716645eb79cf5c8"
  },

  // ② 게스트(체험용) 계정 — 이 계정의 학습은 서버(데이터)에 저장되지 않습니다
  guest: { id: "guest", password: "guest1234" },

  // ③ 학습 설정
  targetRounds: 5,        // 단어당 권장 빈칸쓰기 반복 횟수
  leniency: 1.5,          // 채점 관대함 (1.0 = 엄격, 1.5 = 기본(관대), 2.0 = 매우 관대)
  ttsMode: "online",      // 발음 방식: "online" = 항상 인터넷 음성(Google→Baidu 순, 실패 시에만 기기 음성)
                          //            "auto"   = 기기에 중국어 음성이 있으면 기기 음성, 없으면 인터넷 음성
                          //            "device" = 기기 음성만
  ttsRate: 0.8,           // 발음 재생 속도 (1.0 = 보통)

  // ④ 최종 점수 가중치 (합계 1.0)
  weights: { count: 0.25, order: 0.25, start: 0.20, shape: 0.30 },

  consentVersion: "v5"
};
