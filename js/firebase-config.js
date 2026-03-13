/**
 * firebase-config.js
 * Firebase 初期化モジュール（juku-agent プロジェクト）
 */

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getFirestore,
         enableIndexedDbPersistence }
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

let app = null;
let db  = null;
let isConfigured = false;

try {
  app = initializeApp(firebaseConfig);
  db  = getFirestore(app);

  // オフラインキャッシュ（IndexedDB）を有効化
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('[Firebase] 複数タブが開かれています。オフラインキャッシュは最初のタブのみ有効です。');
    } else if (err.code === 'unimplemented') {
      console.warn('[Firebase] このブラウザはオフラインキャッシュをサポートしていません。');
    }
  });

  isConfigured = true;
  console.info('[Firebase] 接続完了:', firebaseConfig.projectId);
} catch (e) {
  console.error('[Firebase] 初期化エラー:', e);
}

export { db, isConfigured };
