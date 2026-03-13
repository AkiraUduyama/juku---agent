/**
 * class-time-agent.js
 * 授業時間記録エージェント
 * - 授業セッションの開始/終了記録
 * - 科目・講師・日付ごとの集計
 */

import { BaseAgent } from './base-agent.js';

export class ClassTimeAgent extends BaseAgent {
  constructor() {
    super('class-time', '授業時間記録', '⏱️', 'class_sessions');
    this._activeSession = null; // 現在進行中のセッション
  }

  render() {
    const active = this._activeSession;
    return `
      <h1 class="page-title">⏱️ 授業時間記録エージェント</h1>

      <!-- 進行中セッション表示 -->
      <div id="ct-active-banner" class="${active ? '' : 'hidden'}" style="
        background:linear-gradient(135deg,#2563eb,#7c3aed);
        color:#fff; border-radius:8px; padding:16px 20px;
        display:flex; align-items:center; justify-content:space-between;
        margin-bottom:16px;">
        <div>
          <div style="font-size:11px;opacity:.8">授業中</div>
          <div style="font-size:18px;font-weight:700" id="ct-active-info">
            ${active ? `${active.subject} ― 開始 ${active.startTime}` : ''}
          </div>
          <div style="font-size:13px;opacity:.8" id="ct-active-elapsed">経過時間を計算中...</div>
        </div>
        <button class="btn" style="background:#fff;color:#2563eb;font-weight:700"
          onclick="window._ctAgent._endSession()">授業終了</button>
      </div>

      <div class="tabs" id="ct-tabs">
        <button class="tab-btn active" data-tab="ct-today">本日</button>
        <button class="tab-btn" data-tab="ct-all">全記録</button>
        <button class="tab-btn" data-tab="ct-stats">集計</button>
      </div>

      <!-- 本日 -->
      <div id="ct-today" class="tab-content active">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📅 本日の授業</div>
            <div class="flex gap-1">
              <button class="btn btn-success" data-action="start" id="ct-start-btn">▶️ 授業開始</button>
              <button class="btn btn-ghost" id="ct-manual-btn">＋ 手動記録</button>
            </div>
          </div>
          <div id="ct-today-list">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 全記録 -->
      <div id="ct-all" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 授業記録一覧</div>
            <div class="flex gap-1">
              <input type="month" id="ct-filter-month" class="form-control" style="width:140px" />
              <button class="btn btn-ghost btn-sm" id="ct-filter-btn">絞り込み</button>
            </div>
          </div>
          <div id="ct-all-list">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 集計 -->
      <div id="ct-stats" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📊 科目別集計</div>
            <input type="month" id="ct-stats-month" class="form-control" style="width:140px" />
          </div>
          <div id="ct-stats-content">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    window._ctAgent = this;

    // タブ
    document.getElementById('ct-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('#ct-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#ct-today,#ct-all,#ct-stats').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });

    document.getElementById('ct-start-btn').addEventListener('click', () => this._startSession());
    document.getElementById('ct-manual-btn').addEventListener('click', () => this._openManualModal());

    const statsMonth = document.getElementById('ct-stats-month');
    statsMonth.value = this.today().slice(0,7);
    statsMonth.addEventListener('change', () => this._loadStats(statsMonth.value));

    const filterMonth = document.getElementById('ct-filter-month');
    filterMonth.value = this.today().slice(0,7);
    document.getElementById('ct-filter-btn').addEventListener('click', () => this._loadAllList(filterMonth.value));

    // 進行中セッション復元
    const saved = localStorage.getItem('juku_active_session');
    if (saved) {
      this._activeSession = JSON.parse(saved);
      this._updateActiveBanner();
    }

    // 経過時間更新
    this._elapsedTimer = setInterval(() => this._updateElapsed(), 1000);

    await Promise.all([
      this._loadTodayList(),
      this._loadStats(this.today().slice(0,7)),
    ]);
  }

  handleCommand(cmd, action) {
    if (action === 'start')  setTimeout(() => this._startSession(), 200);
    if (action === 'end')    setTimeout(() => this._endSession(), 200);
    return true;
  }

  /* ===== セッション管理 ===== */
  _startSession() {
    if (this._activeSession) {
      this.toast('現在進行中の授業があります。先に終了してください。', 'warning');
      return;
    }
    this.openModal('授業開始', `
      <form id="ct-start-form">
        <div class="form-group">
          <label class="form-label">科目 <span style="color:red">*</span></label>
          <select class="form-control" name="subject" required>
            <option value="">選択</option>
            <option>数学</option><option>英語</option><option>国語</option>
            <option>理科</option><option>社会</option><option>物理</option>
            <option>化学</option><option>生物</option><option>日本史</option>
            <option>世界史</option><option>地理</option><option>現代文</option>
            <option>古文</option><option>漢文</option><option>その他</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">担当講師</label>
          <input type="text" class="form-control" name="teacher" placeholder="田中 先生" />
        </div>
        <div class="form-group">
          <label class="form-label">備考</label>
          <input type="text" class="form-control" name="notes" placeholder="単元名など" />
        </div>
        <button type="submit" class="btn btn-success" style="width:100%">▶️ 授業開始</button>
      </form>`);

    document.getElementById('ct-start-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      const now = new Date();
      this._activeSession = {
        ...data,
        date: this.today(),
        startTime: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
        startTimestamp: now.getTime(),
      };
      localStorage.setItem('juku_active_session', JSON.stringify(this._activeSession));
      this._updateActiveBanner();
      this.toast(`授業を開始しました: ${data.subject}`);
      this.closeModal();
    });
  }

  async _endSession() {
    if (!this._activeSession) return;
    const now = new Date();
    const endTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const duration = Math.round((now.getTime() - this._activeSession.startTimestamp) / 60000);

    const record = {
      ...this._activeSession,
      endTime,
      duration,
    };
    delete record.startTimestamp;

    await this.add(record);
    localStorage.removeItem('juku_active_session');
    this._activeSession = null;

    document.getElementById('ct-active-banner').classList.add('hidden');
    this.toast(`授業終了: ${record.subject} (${this.minsToHM(duration)})`);
    await this._loadTodayList();
  }

  _updateActiveBanner() {
    const banner = document.getElementById('ct-active-banner');
    const info   = document.getElementById('ct-active-info');
    if (!banner || !info) return;
    if (this._activeSession) {
      banner.classList.remove('hidden');
      info.textContent = `${this._activeSession.subject} ― 開始 ${this._activeSession.startTime}`;
    }
  }

  _updateElapsed() {
    if (!this._activeSession) return;
    const el = document.getElementById('ct-active-elapsed');
    if (!el) return;
    const mins = Math.round((Date.now() - this._activeSession.startTimestamp) / 60000);
    el.textContent = `経過: ${this.minsToHM(mins)}`;
  }

  /* ===== 本日リスト ===== */
  async _loadTodayList() {
    const el = document.getElementById('ct-today-list');
    if (!el) return;
    const sessions = await this.getWhere('date', '==', this.today(), 'createdAt');

    if (sessions.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>本日の記録はありません</p></div>';
      return;
    }

    const total = sessions.reduce((s, r) => s + (r.duration || 0), 0);
    el.innerHTML = `
      <div class="mb-2 text-muted">合計 <strong>${this.minsToHM(total)}</strong></div>
      <div class="table-wrap"><table>
        <thead><tr><th>科目</th><th>開始</th><th>終了</th><th>時間</th><th>講師</th><th>備考</th><th>操作</th></tr></thead>
        <tbody>
          ${sessions.map(s => `<tr>
            <td class="fw-bold">${s.subject}</td>
            <td>${s.startTime || '-'}</td>
            <td>${s.endTime || '-'}</td>
            <td>${s.duration != null ? this.minsToHM(s.duration) : '-'}</td>
            <td>${s.teacher || '-'}</td>
            <td>${s.notes || ''}</td>
            <td><button class="btn btn-sm btn-danger" onclick="window._ctAgent._deleteSession('${s.id}')">削除</button></td>
          </tr>`).join('')}
        </tbody></table></div>`;
  }

  /* ===== 全記録リスト ===== */
  async _loadAllList(month) {
    const el = document.getElementById('ct-all-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    const start = `${month}-01`;
    const end   = `${month}-31`;
    const all = await this.getWhere('date', '>=', start, 'date');
    const records = all.filter(r => r.date <= end);

    if (records.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>この月の記録はありません</p></div>';
      return;
    }
    const total = records.reduce((s,r) => s+(r.duration||0),0);
    el.innerHTML = `
      <div class="mb-2">合計 <strong>${this.minsToHM(total)}</strong> / ${records.length}コマ</div>
      <div class="table-wrap"><table>
        <thead><tr><th>日付</th><th>科目</th><th>開始</th><th>終了</th><th>時間</th><th>講師</th></tr></thead>
        <tbody>
          ${records.map(s => `<tr>
            <td>${s.date}</td>
            <td class="fw-bold">${s.subject}</td>
            <td>${s.startTime||'-'}</td><td>${s.endTime||'-'}</td>
            <td>${s.duration!=null?this.minsToHM(s.duration):'-'}</td>
            <td>${s.teacher||'-'}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
  }

  /* ===== 集計 ===== */
  async _loadStats(month) {
    const el = document.getElementById('ct-stats-content');
    if (!el) return;
    const start = `${month}-01`;
    const end   = `${month}-31`;
    const all = await this.getWhere('date', '>=', start, 'date');
    const records = all.filter(r => r.date <= end);

    if (records.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>データがありません</p></div>';
      return;
    }

    // 科目別集計
    const bySubject = {};
    records.forEach(r => {
      if (!bySubject[r.subject]) bySubject[r.subject] = { count:0, mins:0 };
      bySubject[r.subject].count++;
      bySubject[r.subject].mins += r.duration||0;
    });

    const total = records.reduce((s,r)=>s+(r.duration||0),0);
    const sorted = Object.entries(bySubject).sort((a,b)=>b[1].mins-a[1].mins);

    el.innerHTML = `
      <div class="stat-card success mb-2" style="padding:12px">
        <div class="stat-label">月間合計</div>
        <div class="stat-value">${this.minsToHM(total)}</div>
        <div class="stat-sub">${records.length}コマ</div>
      </div>
      ${sorted.map(([subject, d]) => {
        const pct = Math.round(d.mins/total*100);
        return `
          <div style="margin-bottom:12px">
            <div class="flex items-center gap-1 mb-1">
              <span class="fw-bold flex-1">${subject}</span>
              <span class="badge badge-primary">${d.count}コマ</span>
              <span class="text-muted">${this.minsToHM(d.mins)}</span>
            </div>
            <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
          </div>`;
      }).join('')}`;
  }

  /* ===== 手動記録 ===== */
  _openManualModal() {
    this.openModal('授業を手動記録', `
      <form id="ct-manual-form">
        <div class="form-group">
          <label class="form-label">科目 <span style="color:red">*</span></label>
          <select class="form-control" name="subject" required>
            <option value="">選択</option>
            <option>数学</option><option>英語</option><option>国語</option>
            <option>理科</option><option>社会</option><option>物理</option>
            <option>化学</option><option>生物</option><option>その他</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">日付</label>
          <input type="date" class="form-control" name="date" value="${this.today()}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">開始時刻</label>
            <input type="time" class="form-control" name="startTime" />
          </div>
          <div class="form-group">
            <label class="form-label">終了時刻</label>
            <input type="time" class="form-control" name="endTime" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">担当講師</label>
          <input type="text" class="form-control" name="teacher" />
        </div>
        <div class="form-group">
          <label class="form-label">備考</label>
          <input type="text" class="form-control" name="notes" />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">記録する</button>
      </form>`);

    document.getElementById('ct-manual-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      // 所要時間計算
      if (data.startTime && data.endTime) {
        const [sh,sm] = data.startTime.split(':').map(Number);
        const [eh,em] = data.endTime.split(':').map(Number);
        data.duration = (eh*60+em) - (sh*60+sm);
      }
      await this.add(data);
      this.toast('授業を記録しました');
      this.closeModal();
      await this._loadTodayList();
    });
  }

  async _deleteSession(id) {
    if (!this.confirm('この記録を削除しますか？')) return;
    await this.delete(id);
    this.toast('削除しました', 'warning');
    await this._loadTodayList();
  }
}
