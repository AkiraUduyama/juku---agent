/**
 * firebase-config.js
 * Firebase 初期化モジュール
 *
 * ⚠️ 使用前に以下の手順でFirebaseを設定してください：
 *   1. https://console.firebase.google.com/ でプロジェクトを作成
 *   2. Firestoreデータベースを作成（テストモードで開始）
 *   3. プロジェクト設定 > マイアプリ > ウェブアプリを追加
 *   4. 下記の firebaseConfig の値を自分のプロジェクトの値に変更
 */

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getFirestore,
         enableIndexedDbPersistence }
                            from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

// ▼▼▼ ここを自分のFirebaseプロジェクトの設定に変更してください ▼▼▼
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ▲▲▲ ここまで ▲▲▲

let app = null;
let db  = null;
let isConfigured = false;

try {
  // プレースホルダーのままかチェック
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);

    // オフラインキャッシュ（IndexedDB）を有効化
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('複数タブが開かれています。オフラインキャッシュは最初のタブのみ有効です。');
      } else if (err.code === 'unimplemented') {
        console.warn('このブラウザはオフラインキャッシュをサポートしていません。');
      }
    });

    isConfigured = true;
    console.info('[Firebase] 接続完了:', firebaseConfig.projectId);
  } else {
    console.warn('[Firebase] 未設定 → ローカルストレージモードで動作します');
  }
} catch (e) {
  console.error('[Firebase] 初期化エラー:', e);
}

export { db, isConfigured };
