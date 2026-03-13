/**
 * firebase-config.js
 * Firebase 初期化モジュール（juku-agent プロジェクト）
 *
 * Firebase v10 では enableIndexedDbPersistence が廃止されたため
 * initializeFirestore + persistentLocalCache を使用する
 */

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

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

  // v10 の正式なオフラインキャッシュAPI（複数タブ対応）
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });

  isConfigured = true;
  console.info('[Firebase] 接続完了 ✅ projectId:', firebaseConfig.projectId);
} catch (e) {
  console.error('[Firebase] 初期化エラー ❌:', e);
  console.warn('[Firebase] ローカルストレージモードで動作します');
}

export { db, isConfigured };
