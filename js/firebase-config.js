/**
 * firebase-config.js
 * Firebase 初期化モジュール（juku-agent プロジェクト）
 *
 * CDN ビルドでは persistentLocalCache 等が undefined になるため
 * getFirestore() のみで初期化する（最もシンプルで確実な方法）。
 */

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getFirestore }
  from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCNblOKeP-xGxmm6t5GN5dDCq75WadQUdU",
  authDomain:        "juku-agent.firebaseapp.com",
  projectId:         "juku-agent",
  storageBucket:     "juku-agent.firebasestorage.app",
  messagingSenderId: "279883828399",
  appId:             "1:279883828399:web:19c4949b04a00bd7b5985a",
  measurementId:     "G-QENSJ2HK4X"
};

let db           = null;
let isConfigured = false;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  isConfigured = true;
  console.info('[Firebase] ✅ 接続完了 projectId:', firebaseConfig.projectId);
} catch (e) {
  console.error('[Firebase] ❌ 初期化エラー:', e.message, e);
  console.warn('[Firebase] ⚠️ ローカルストレージモードで動作します');
}

export { db, isConfigured };
