# 塾業務管理システム

サブエージェント構成による塾講師向け業務管理Webアプリケーション。

## 機能一覧

| エージェント | 機能 |
|---|---|
| メインエージェント | 自然言語コマンドの解析・ルーティング・ダッシュボード |
| 出席管理エージェント | 生徒マスタ・日次出席記録・出席率集計 |
| 授業時間記録エージェント | 授業開始/終了タイマー・手動記録・科目別集計 |
| 勤怠管理エージェント | 講師出勤/退勤打刻・勤務時間計算・月次集計 |
| アラームエージェント | アラーム設定（毎日/曜日指定）・ブラウザ通知 |
| 時間割管理エージェント | 週間グリッド表示・授業割り当て・色分け |
| 成果物管理エージェント | 宿題/課題管理・提出状況追跡・期限管理 |
| レポート出力エージェント | 月次総合レポート・CSV出力・印刷 |

## セットアップ

### 1. Firebase プロジェクト作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `juku-kanri`）
4. Firestore Database を作成（テストモードで開始）
5. 「プロジェクトの設定 → マイアプリ → ウェブアプリを追加」から設定値を取得

### 2. Firebase 設定を記入

`js/firebase-config.js` を開き、YOUR_*** の部分を自分の値に変更：

```javascript
const firebaseConfig = {
  apiKey:            "実際のAPIキー",
  authDomain:        "プロジェクトID.firebaseapp.com",
  projectId:         "プロジェクトID",
  storageBucket:     "プロジェクトID.appspot.com",
  messagingSenderId: "送信者ID",
  appId:             "アプリID"
};
```

### 3. Firestore セキュリティルール（本番運用時）

Firebase Console → Firestore → ルール に貼り付け：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // 開発時のみ
      // 本番では認証を追加してください
    }
  }
}
```

### 4. 起動

**Firebase 未設定でも動作します**（LocalStorage モード）

```bash
# Python の場合
python -m http.server 8080

# Node.js の場合
npx serve .

# VS Code の場合
Live Server 拡張をインストールして「Go Live」
```

ブラウザで `http://localhost:8080` にアクセス。

## コマンド例

トップバーのコマンド入力欄に以下を入力：

| コマンド | 動作 |
|---|---|
| `出席を記録` | 出席管理エージェントを開き記録フォームを表示 |
| `授業開始` | 授業タイマーを開始 |
| `授業終了` | 進行中の授業を終了・記録 |
| `出勤打刻` | 勤怠エージェントで出勤記録 |
| `退勤打刻` | 退勤を記録 |
| `アラームを設定` | アラーム追加フォームを表示 |
| `時間割を表示` | 週間時間割グリッドを表示 |
| `宿題を追加` | 課題追加フォームを表示 |
| `今月のレポートを出力` | 月次レポートを生成 |

## ファイル構成

```
塾管理システム/
├── index.html                        # エントリーポイント
├── css/
│   └── styles.css                    # グローバルスタイル
├── js/
│   ├── firebase-config.js            # Firebase初期化
│   ├── main-agent.js                 # メインエージェント（統括・ルーター）
│   └── agents/
│       ├── base-agent.js             # 基底クラス（Firebase/LS 抽象CRUD）
│       ├── attendance-agent.js       # 出席管理
│       ├── class-time-agent.js       # 授業時間記録
│       ├── work-attendance-agent.js  # 勤怠管理
│       ├── alarm-agent.js            # アラーム
│       ├── schedule-agent.js         # 時間割
│       ├── deliverable-agent.js      # 成果物管理
│       └── report-agent.js           # レポート出力
└── README.md
```

## アーキテクチャ

```
ユーザー入力（テキストコマンド / UIクリック）
        ↓
  MainAgent（コマンドルーター）
  ・正規表現パターンマッチ
  ・エージェントへ振り分け
        ↓
  ┌─────────────────────────────────┐
  │         サブエージェント群         │
  │  AttendanceAgent                │
  │  ClassTimeAgent                 │
  │  WorkAttendanceAgent            │
  │  AlarmAgent                     │
  │  ScheduleAgent                  │
  │  DeliverableAgent               │
  │  ReportAgent（他エージェントを参照）│
  └─────────────────────────────────┘
        ↓
  BaseAgent（共通 CRUD）
  ・Firebase Firestore（設定済みの場合）
  ・LocalStorage（フォールバック）
```

## 技術スタック

- **フロントエンド**: HTML / CSS / Vanilla JavaScript (ES Modules)
- **データベース**: Firebase Firestore v10 (CDN)
- **フォールバック**: LocalStorage（Firebase 未設定時）
- **通知**: Web Notifications API
- **エクスポート**: CSV (Blob / URL.createObjectURL)
