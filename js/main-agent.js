/**
 * main-agent.js
 * メインエージェント：ユーザー指示を解釈してサブエージェントに振り分ける統括コントローラー
 */

import { isConfigured }         from './firebase-config.js';
import { AttendanceAgent }      from './agents/attendance-agent.js';
import { ClassTimeAgent }       from './agents/class-time-agent.js';
import { WorkAttendanceAgent }  from './agents/work-attendance-agent.js';
import { AlarmAgent }           from './agents/alarm-agent.js';
import { ScheduleAgent }        from './agents/schedule-agent.js';
import { DeliverableAgent }     from './agents/deliverable-agent.js';
import { ReportAgent }          from './agents/report-agent.js';

/* ================================================================
   コマンドルーティングテーブル
   各エントリ: { pattern: RegExp, agent: string, action?: string }
   ================================================================ */
const COMMAND_ROUTES = [
  // 出席管理
  { pattern: /出席.*記録|記録.*出席|来た|欠席|遅刻|出席確認/,        agent: 'attendance',      action: 'record' },
  { pattern: /出席.*一覧|出席.*表示|出席.*確認/,                     agent: 'attendance',      action: 'list' },
  { pattern: /出席/,                                                  agent: 'attendance' },
  // 授業時間
  { pattern: /授業.*開始|授業.*スタート|開始.*授業/,                  agent: 'class-time',      action: 'start' },
  { pattern: /授業.*終了|授業.*エンド|終了.*授業/,                    agent: 'class-time',      action: 'end' },
  { pattern: /授業時間|授業.*記録|授業.*追加/,                        agent: 'class-time' },
  // 勤怠管理
  { pattern: /出勤|勤怠.*記録|打刻/,                                  agent: 'work-attendance', action: 'checkin' },
  { pattern: /退勤|帰る|退社/,                                        agent: 'work-attendance', action: 'checkout' },
  { pattern: /勤怠|勤務/,                                             agent: 'work-attendance' },
  // アラーム
  { pattern: /アラーム.*設定|設定.*アラーム|リマインダー.*追加/,       agent: 'alarm',           action: 'add' },
  { pattern: /アラーム|リマインダー|通知/,                            agent: 'alarm' },
  // 時間割
  { pattern: /時間割.*追加|追加.*時間割|授業.*追加.*時間割/,           agent: 'schedule',        action: 'add' },
  { pattern: /時間割|スケジュール|週.*予定/,                           agent: 'schedule' },
  // 成果物
  { pattern: /宿題.*追加|課題.*追加|宿題.*登録/,                      agent: 'deliverable',     action: 'add' },
  { pattern: /宿題|課題|成果物|提出/,                                 agent: 'deliverable' },
  // レポート
  { pattern: /レポート.*出力|出力.*レポート|集計.*出力/,               agent: 'report',          action: 'generate' },
  { pattern: /レポート|集計|統計|月.*まとめ/,                         agent: 'report' },
];

class MainAgent {
  constructor() {
    this.agents    = {};
    this.currentAgent = 'dashboard';
    this.contentEl = null;
    this.feedbackEl = null;
  }

  /* ===== 初期化 ===== */
  async init() {
    this.contentEl  = document.getElementById('content-area');
    this.feedbackEl = document.getElementById('command-feedback');

    // サブエージェントを登録
    const att  = new AttendanceAgent();
    const ct   = new ClassTimeAgent();
    const wa   = new WorkAttendanceAgent();
    const al   = new AlarmAgent();
    const sc   = new ScheduleAgent();
    const dl   = new DeliverableAgent();
    const rp   = new ReportAgent();

    // 相互参照が必要なエージェントに依存を注入
    rp.setAgents({ att, ct, wa, dl });

    this.agents = {
      attendance:       att,
      'class-time':     ct,
      'work-attendance': wa,
      alarm:            al,
      schedule:         sc,
      deliverable:      dl,
      report:           rp,
    };

    this._setupNavigation();
    this._setupCommandBar();
    this._setupModal();
    this._updateDatetime();
    setInterval(() => this._updateDatetime(), 1000);
    this._updateConnectionStatus();

    // ダッシュボードを最初に表示
    this._renderDashboard();
  }

  /* ===== ナビゲーション ===== */
  _setupNavigation() {
    document.getElementById('nav-menu').addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item');
      if (!item) return;
      const agentId = item.dataset.agent;
      this._navigate(agentId);
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });
  }

  _navigate(agentId, action = null) {
    // ナビ強調
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navEl = document.querySelector(`.nav-item[data-agent="${agentId}"]`);
    if (navEl) navEl.classList.add('active');

    this.currentAgent = agentId;

    if (agentId === 'dashboard') {
      this._renderDashboard();
      return;
    }

    const agent = this.agents[agentId];
    if (!agent) return;

    agent.mount(this.contentEl);

    // アクション指定があれば少し待ってから実行
    if (action) {
      setTimeout(() => {
        const btn = this.contentEl.querySelector(`[data-action="${action}"]`);
        if (btn) btn.click();
      }, 100);
    }
  }

  /* ===== コマンドバー ===== */
  _setupCommandBar() {
    const input = document.getElementById('command-input');
    const btn   = document.getElementById('command-btn');

    const execute = () => {
      const cmd = input.value.trim();
      if (!cmd) return;
      this._processCommand(cmd);
      input.value = '';
    };

    btn.addEventListener('click', execute);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') execute(); });
  }

  /**
   * コマンド解析・ルーティング（メインエージェントの核心）
   */
  _processCommand(command) {
    this._showFeedback(`📡 解析中: "${command}"`, 'info');

    // ルーティングテーブルを順に試行
    for (const route of COMMAND_ROUTES) {
      if (route.pattern.test(command)) {
        const agent = this.agents[route.agent];
        if (!agent) continue;

        // まずエージェント固有のコマンドハンドラを試す
        const handled = agent.handleCommand(command, route.action);

        if (handled || true) {
          this._navigate(route.agent, route.action);
          this._showFeedback(
            `🤖 「${command}」→ ${agent.label}エージェントに振り分けました`,
            'success'
          );
          return;
        }
      }
    }

    // ダッシュボード系コマンド
    if (/ダッシュボード|ホーム|トップ/.test(command)) {
      this._navigate('dashboard');
      this._showFeedback('🏠 ダッシュボードを表示しました', 'success');
      return;
    }

    this._showFeedback(
      `❓ コマンドを認識できませんでした。「出席を記録」「アラームを設定」などと入力してください。`,
      'error'
    );
  }

  _showFeedback(msg, type = 'success') {
    const el = this.feedbackEl;
    el.textContent = msg;
    el.className   = type === 'error' ? 'error' : '';
    el.classList.remove('hidden');
    clearTimeout(this._feedbackTimer);
    this._feedbackTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  /* ===== モーダル ===== */
  _setupModal() {
    document.getElementById('modal-close').addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.add('hidden');
    });
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        document.getElementById('modal-overlay').classList.add('hidden');
      }
    });
  }

  /* ===== 時計 ===== */
  _updateDatetime() {
    const now = new Date();
    const days = ['日','月','火','水','木','金','土'];
    const str  = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${days[now.getDay()]}）`
               + ` ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const el = document.getElementById('current-datetime');
    if (el) el.textContent = str;
  }

  /* ===== 接続ステータス ===== */
  _updateConnectionStatus() {
    const el = document.getElementById('connection-status');
    if (!el) return;
    if (isConfigured) {
      el.classList.add('connected');
      el.querySelector('.status-text').textContent = 'Firebase接続済み';
    } else {
      el.querySelector('.status-text').textContent = 'ローカルモード';
    }
  }

  /* ===== ダッシュボード ===== */
  async _renderDashboard() {
    this.contentEl.innerHTML = `
      <div class="loading-spinner"><div class="spinner"></div><p>ダッシュボード読み込み中...</p></div>`;

    // 各エージェントから統計取得（並列）
    const today = new Date().toISOString().slice(0, 10);
    const [students, todayAtt, todaySessions, alarms, deliverables] = await Promise.all([
      this._safeGetAll('attendance', 'students'),
      this._safeGetWhere('attendance', 'attendance', 'date', '==', today),
      this._safeGetWhere('class-time', 'class_sessions', 'date', '==', today),
      this._safeGetAll('alarm', 'alarms'),
      this._safeGetWhere('deliverable', 'deliverables', 'status', '!=', 'completed'),
    ]);

    const presentCount = todayAtt.filter(r => r.status === 'present').length;
    const absentCount  = todayAtt.filter(r => r.status === 'absent').length;
    const lateCount    = todayAtt.filter(r => r.status === 'late').length;
    const totalMins    = todaySessions.reduce((s, r) => s + (r.duration || 0), 0);
    const activeAlarms = alarms.filter(a => a.enabled !== false).length;
    const pendingDl    = deliverables.length;

    const modeLabel = isConfigured ? '☁️ Firebase' : '💾 ローカル';

    this.contentEl.innerHTML = `
      <h1 class="page-title">🏠 ダッシュボード
        <span class="badge badge-info" style="font-size:11px">${modeLabel}</span>
      </h1>

      <!-- 統計カード -->
      <div class="stats-grid">
        <div class="stat-card primary" style="cursor:pointer" onclick="window._mainAgent._navigate('attendance')">
          <div class="stat-icon">📋</div>
          <div class="stat-label">本日の出席</div>
          <div class="stat-value">${presentCount}<span style="font-size:14px;color:var(--text-muted)">名</span></div>
          <div class="stat-sub">欠席 ${absentCount}名 / 遅刻 ${lateCount}名</div>
        </div>
        <div class="stat-card success" style="cursor:pointer" onclick="window._mainAgent._navigate('class-time')">
          <div class="stat-icon">⏱️</div>
          <div class="stat-label">本日の授業時間</div>
          <div class="stat-value">${Math.floor(totalMins/60)}<span style="font-size:14px;color:var(--text-muted)">時間</span>${totalMins%60}<span style="font-size:14px;color:var(--text-muted)">分</span></div>
          <div class="stat-sub">授業 ${todaySessions.length}コマ</div>
        </div>
        <div class="stat-card warning" style="cursor:pointer" onclick="window._mainAgent._navigate('deliverable')">
          <div class="stat-icon">📁</div>
          <div class="stat-label">未完了の課題</div>
          <div class="stat-value">${pendingDl}<span style="font-size:14px;color:var(--text-muted)">件</span></div>
          <div class="stat-sub">提出待ち・確認待ち</div>
        </div>
        <div class="stat-card info" style="cursor:pointer" onclick="window._mainAgent._navigate('alarm')">
          <div class="stat-icon">🔔</div>
          <div class="stat-label">有効なアラーム</div>
          <div class="stat-value">${activeAlarms}<span style="font-size:14px;color:var(--text-muted)">件</span></div>
          <div class="stat-sub">全${alarms.length}件中</div>
        </div>
      </div>

      <div class="two-col">
        <!-- クイックアクション -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">⚡ クイックアクション</div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <button class="btn btn-primary" onclick="window._mainAgent._navigate('attendance','record')">📋 出席を記録</button>
            <button class="btn btn-success" onclick="window._mainAgent._navigate('class-time','start')">▶️ 授業開始</button>
            <button class="btn btn-warning" onclick="window._mainAgent._navigate('work-attendance','checkin')" style="color:#fff">👤 出勤打刻</button>
            <button class="btn btn-ghost" onclick="window._mainAgent._navigate('alarm','add')">🔔 アラーム追加</button>
            <button class="btn btn-ghost" onclick="window._mainAgent._navigate('deliverable','add')">📁 課題追加</button>
            <button class="btn btn-ghost" onclick="window._mainAgent._navigate('report','generate')">📊 レポート出力</button>
          </div>
        </div>

        <!-- 本日の授業 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📅 本日の授業セッション</div>
            <button class="btn btn-ghost btn-sm" onclick="window._mainAgent._navigate('class-time')">詳細→</button>
          </div>
          ${todaySessions.length === 0
            ? '<div class="empty-state" style="padding:20px"><div class="empty-icon">📭</div><p class="empty-text">本日の授業記録なし</p></div>'
            : `<div class="table-wrap"><table>
                <thead><tr><th>科目</th><th>開始</th><th>終了</th><th>時間</th></tr></thead>
                <tbody>
                  ${todaySessions.slice(0,5).map(s => `
                    <tr>
                      <td>${s.subject || '-'}</td>
                      <td>${(s.startTime||'').slice(0,5)}</td>
                      <td>${(s.endTime||'').slice(0,5)}</td>
                      <td>${Math.floor((s.duration||0)/60)}h${(s.duration||0)%60}m</td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`
          }
        </div>
      </div>

      <!-- コマンドヘルプ -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">💬 コマンド例</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
          ${[
            ['出席を記録','attendance'],
            ['授業開始','class-time'],
            ['授業終了','class-time'],
            ['出勤打刻','work-attendance'],
            ['退勤打刻','work-attendance'],
            ['アラームを設定','alarm'],
            ['時間割を表示','schedule'],
            ['宿題を追加','deliverable'],
            ['今月のレポートを出力','report'],
          ].map(([cmd, agent]) => `
            <button class="btn btn-ghost" style="justify-content:flex-start;text-align:left"
              onclick="document.getElementById('command-input').value='${cmd}';document.getElementById('command-btn').click()">
              💬 ${cmd}
            </button>`).join('')}
        </div>
      </div>
    `;
  }

  /* ===== データ取得ヘルパー ===== */
  async _safeGetAll(agentId, collection) {
    try {
      return await (this.agents[agentId]?.getAll?.() || Promise.resolve([]));
    } catch { return []; }
  }

  async _safeGetWhere(agentId, col, field, op, value) {
    try {
      return await (this.agents[agentId]?.getWhere?.(field, op, value) || Promise.resolve([]));
    } catch { return []; }
  }
}

/* ===== エントリーポイント ===== */
const mainAgent = new MainAgent();
window._mainAgent = mainAgent; // ダッシュボードHTMLからアクセス用

document.addEventListener('DOMContentLoaded', () => {
  mainAgent.init();
});
