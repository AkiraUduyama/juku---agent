/**
 * work-attendance-agent.js
 * 勤怠管理エージェント
 * - 講師の出勤・退勤記録
 * - 勤務時間・残業時間の計算
 * - 月次勤怠サマリー
 */

import { BaseAgent } from './base-agent.js';

const TEACHERS_KEY = 'juku_teachers';
const STANDARD_HOURS = 8; // 標準勤務時間（時間）

export class WorkAttendanceAgent extends BaseAgent {
  constructor() {
    super('work-attendance', '勤怠管理', '👤', 'work_attendance');
  }

  /* ===== 講師マスタ (LocalStorage) ===== */
  _getTeachers() {
    return JSON.parse(localStorage.getItem(TEACHERS_KEY) || '[]');
  }
  _saveTeachers(arr) {
    localStorage.setItem(TEACHERS_KEY, JSON.stringify(arr));
  }
  _addTeacher(data) {
    const arr = this._getTeachers();
    const r   = { id: `t_${Date.now()}`, ...data };
    arr.push(r);
    this._saveTeachers(arr);
    return r;
  }

  /* ===== レンダリング ===== */
  render() {
    return `
      <h1 class="page-title">👤 勤怠管理エージェント</h1>

      <div class="tabs" id="wa-tabs">
        <button class="tab-btn active" data-tab="wa-today">本日の打刻</button>
        <button class="tab-btn" data-tab="wa-history">勤怠履歴</button>
        <button class="tab-btn" data-tab="wa-summary">月次集計</button>
        <button class="tab-btn" data-tab="wa-teachers">講師マスタ</button>
      </div>

      <!-- 本日打刻 -->
      <div id="wa-today" class="tab-content active">
        <div class="card">
          <div class="card-header">
            <div class="card-title">🕐 本日の打刻 ― <span id="wa-date-display"></span></div>
          </div>
          <div id="wa-clock-section" style="text-align:center; padding:20px 0">
            <div style="font-size:48px; font-weight:700; color:var(--primary)" id="wa-clock">00:00:00</div>
            <div style="color:var(--text-muted); margin-bottom:20px" id="wa-date-label"></div>
            <div class="flex gap-2" style="justify-content:center">
              <button class="btn btn-success" data-action="checkin" id="wa-checkin-btn" style="padding:12px 32px; font-size:16px">
                🟢 出勤
              </button>
              <button class="btn btn-danger" id="wa-checkout-btn" style="padding:12px 32px; font-size:16px">
                🔴 退勤
              </button>
            </div>
          </div>
          <div id="wa-today-records">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 勤怠履歴 -->
      <div id="wa-history" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 勤怠記録</div>
            <div class="flex gap-1">
              <select id="wa-teacher-filter" class="form-control" style="width:160px">
                <option value="">全員</option>
              </select>
              <input type="month" id="wa-hist-month" class="form-control" style="width:140px" />
              <button class="btn btn-ghost btn-sm" id="wa-hist-load">表示</button>
            </div>
          </div>
          <div id="wa-hist-table">
            <div class="empty-state"><div class="empty-icon">📂</div><p>月を選択して表示</p></div>
          </div>
        </div>
      </div>

      <!-- 月次集計 -->
      <div id="wa-summary" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📊 月次集計</div>
            <input type="month" id="wa-sum-month" class="form-control" style="width:140px" />
          </div>
          <div id="wa-summary-content">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 講師マスタ -->
      <div id="wa-teachers" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">👥 講師マスタ</div>
            <button class="btn btn-primary" id="wa-add-teacher-btn">＋ 講師追加</button>
          </div>
          <div id="wa-teachers-table">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    window._waAgent = this;

    // 時計更新
    this._clockTimer = setInterval(() => this._updateClock(), 1000);
    this._updateClock();

    const today = this.today();
    const d = new Date();
    document.getElementById('wa-date-display').textContent = d.toLocaleDateString('ja-JP');
    document.getElementById('wa-date-label').textContent   = d.toLocaleDateString('ja-JP', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // タブ
    document.getElementById('wa-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('#wa-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#wa-today,#wa-history,#wa-summary,#wa-teachers').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });

    document.getElementById('wa-checkin-btn').addEventListener('click', () => this._punch('checkin'));
    document.getElementById('wa-checkout-btn').addEventListener('click', () => this._punch('checkout'));

    const sumMonth = document.getElementById('wa-sum-month');
    sumMonth.value = today.slice(0,7);
    sumMonth.addEventListener('change', () => this._loadSummary(sumMonth.value));

    const histMonth = document.getElementById('wa-hist-month');
    histMonth.value = today.slice(0,7);
    document.getElementById('wa-hist-load').addEventListener('click', () => {
      const tId = document.getElementById('wa-teacher-filter').value;
      this._loadHistory(histMonth.value, tId);
    });

    document.getElementById('wa-add-teacher-btn').addEventListener('click', () => this._openTeacherModal());

    this._populateTeacherFilter();
    await Promise.all([
      this._loadTodayRecords(),
      this._loadSummary(today.slice(0,7)),
      this._loadTeachersTable(),
    ]);
  }

  handleCommand(cmd, action) {
    if (action === 'checkin')  setTimeout(() => this._punch('checkin'), 200);
    if (action === 'checkout') setTimeout(() => this._punch('checkout'), 200);
    return true;
  }

  _updateClock() {
    const el = document.getElementById('wa-clock');
    if (!el) return;
    const now = new Date();
    el.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  }

  /* ===== 打刻 ===== */
  async _punch(type) {
    const teachers = this._getTeachers();
    if (teachers.length === 0) {
      this.toast('先に講師マスタを登録してください', 'warning');
      this._navigate_teachers();
      return;
    }

    this.openModal(type === 'checkin' ? '🟢 出勤打刻' : '🔴 退勤打刻', `
      <form id="wa-punch-form">
        <div class="form-group">
          <label class="form-label">講師</label>
          <select class="form-control" name="teacherId" required>
            <option value="">選択</option>
            ${teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">時刻</label>
          <input type="time" class="form-control" name="time"
            value="${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}"
          />
        </div>
        <div class="form-group">
          <label class="form-label">備考</label>
          <input type="text" class="form-control" name="notes" placeholder="備考など" />
        </div>
        <button type="submit" class="btn ${type==='checkin'?'btn-success':'btn-danger'}" style="width:100%">
          ${type === 'checkin' ? '🟢 出勤する' : '🔴 退勤する'}
        </button>
      </form>`);

    document.getElementById('wa-punch-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      const teacher = teachers.find(t => t.id === data.teacherId);
      const today = this.today();

      // 既存レコードを検索
      const existing = (await this.getWhere('teacherId','==',data.teacherId,'date'))
        .find(r => r.date === today);

      if (type === 'checkin') {
        if (existing?.checkIn) {
          this.toast('本日はすでに出勤済みです', 'warning');
          this.closeModal();
          return;
        }
        if (existing) {
          await this.update(existing.id, { checkIn: data.time });
        } else {
          await this.add({ teacherId: data.teacherId, teacherName: teacher?.name, date: today, checkIn: data.time, notes: data.notes });
        }
        this.toast(`${teacher?.name} さん 出勤しました`);
      } else {
        if (!existing) {
          this.toast('本日の出勤記録がありません', 'error');
          this.closeModal();
          return;
        }
        const [sh,sm] = (existing.checkIn||'00:00').split(':').map(Number);
        const [eh,em] = data.time.split(':').map(Number);
        const workMins = (eh*60+em) - (sh*60+sm);
        const overtime = Math.max(0, workMins - STANDARD_HOURS*60);
        await this.update(existing.id, { checkOut: data.time, workMins, overtime, notes: data.notes });
        this.toast(`${teacher?.name} さん 退勤しました (勤務 ${this.minsToHM(workMins)})`);
      }

      this.closeModal();
      await this._loadTodayRecords();
    });
  }

  /* ===== 本日記録 ===== */
  async _loadTodayRecords() {
    const el = document.getElementById('wa-today-records');
    if (!el) return;
    const records = await this.getWhere('date','==',this.today(),'createdAt');

    if (records.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:16px"><div class="empty-icon">📭</div><p>本日の打刻記録なし</p></div>';
      return;
    }

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>講師</th><th>出勤</th><th>退勤</th><th>勤務時間</th><th>残業</th><th>備考</th></tr></thead>
      <tbody>
        ${records.map(r => `<tr>
          <td class="fw-bold">${r.teacherName||r.teacherId}</td>
          <td>${r.checkIn||'-'}</td>
          <td>${r.checkOut||'<span class="badge badge-warning">勤務中</span>'}</td>
          <td>${r.workMins!=null ? this.minsToHM(r.workMins) : '-'}</td>
          <td>${r.overtime!=null ? (r.overtime>0?`<span class="text-danger">${this.minsToHM(r.overtime)}</span>`:'なし') : '-'}</td>
          <td>${r.notes||''}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ===== 履歴 ===== */
  async _loadHistory(month, teacherId) {
    const el = document.getElementById('wa-hist-table');
    if (!el) return;
    const start = `${month}-01`, end = `${month}-31`;
    let records = (await this.getWhere('date','>=',start,'date')).filter(r=>r.date<=end);
    if (teacherId) records = records.filter(r=>r.teacherId===teacherId);

    if (records.length===0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>この期間の記録はありません</p></div>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>日付</th><th>講師</th><th>出勤</th><th>退勤</th><th>勤務</th><th>残業</th></tr></thead>
      <tbody>
        ${records.map(r=>`<tr>
          <td>${r.date}</td>
          <td>${r.teacherName||'-'}</td>
          <td>${r.checkIn||'-'}</td>
          <td>${r.checkOut||'-'}</td>
          <td>${r.workMins!=null?this.minsToHM(r.workMins):'-'}</td>
          <td class="${r.overtime>0?'text-danger':''}">${r.overtime!=null?(r.overtime>0?this.minsToHM(r.overtime):'なし'):'-'}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ===== 月次集計 ===== */
  async _loadSummary(month) {
    const el = document.getElementById('wa-summary-content');
    if (!el) return;
    const start = `${month}-01`, end = `${month}-31`;
    const records = (await this.getWhere('date','>=',start,'date')).filter(r=>r.date<=end);
    const teachers = this._getTeachers();

    if (records.length===0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>データがありません</p></div>';
      return;
    }

    // 講師別集計
    const byTeacher = {};
    records.forEach(r => {
      const key = r.teacherName || r.teacherId || '不明';
      if (!byTeacher[key]) byTeacher[key] = { days:0, workMins:0, overtime:0 };
      byTeacher[key].days++;
      byTeacher[key].workMins  += r.workMins||0;
      byTeacher[key].overtime  += r.overtime||0;
    });

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card primary"><div class="stat-icon">📆</div><div class="stat-label">出勤日数（延べ）</div><div class="stat-value">${records.length}</div></div>
        <div class="stat-card success"><div class="stat-icon">⏱️</div><div class="stat-label">総勤務時間</div><div class="stat-value">${this.minsToHM(records.reduce((s,r)=>s+(r.workMins||0),0))}</div></div>
        <div class="stat-card warning"><div class="stat-icon">🌙</div><div class="stat-label">総残業時間</div><div class="stat-value">${this.minsToHM(records.reduce((s,r)=>s+(r.overtime||0),0))}</div></div>
      </div>
      <h4 class="card-title mb-2">講師別サマリー</h4>
      <div class="table-wrap"><table>
        <thead><tr><th>講師</th><th>出勤日数</th><th>総勤務</th><th>残業</th></tr></thead>
        <tbody>
          ${Object.entries(byTeacher).map(([name,d])=>`<tr>
            <td class="fw-bold">${name}</td>
            <td>${d.days}日</td>
            <td>${this.minsToHM(d.workMins)}</td>
            <td class="${d.overtime>0?'text-danger':''}">${d.overtime>0?this.minsToHM(d.overtime):'なし'}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
  }

  /* ===== 講師マスタ ===== */
  _populateTeacherFilter() {
    const sel = document.getElementById('wa-teacher-filter');
    if (!sel) return;
    const teachers = this._getTeachers();
    teachers.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
  }

  async _loadTeachersTable() {
    const el = document.getElementById('wa-teachers-table');
    if (!el) return;
    const teachers = this._getTeachers();
    if (teachers.length===0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>講師が登録されていません</p></div>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>氏名</th><th>担当科目</th><th>時給</th><th>操作</th></tr></thead>
      <tbody>
        ${teachers.map(t=>`<tr>
          <td class="fw-bold">${t.name}</td>
          <td>${(t.subjects||[]).join('・')||'-'}</td>
          <td>${t.hourlyRate?`${t.hourlyRate}円`:'-'}</td>
          <td><button class="btn btn-sm btn-danger" onclick="window._waAgent._deleteTeacher('${t.id}')">削除</button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
    window._waAgent = this;
  }

  _openTeacherModal() {
    this.openModal('講師を追加', `
      <form id="wa-teacher-form">
        <div class="form-group">
          <label class="form-label">氏名 <span style="color:red">*</span></label>
          <input type="text" class="form-control" name="name" required placeholder="田中 花子" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">担当科目</label>
            <input type="text" class="form-control" name="subjectsStr" placeholder="数学,英語" />
          </div>
          <div class="form-group">
            <label class="form-label">時給（円）</label>
            <input type="number" class="form-control" name="hourlyRate" placeholder="1200" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">追加する</button>
      </form>`);

    document.getElementById('wa-teacher-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.subjects = data.subjectsStr.split(',').map(s=>s.trim()).filter(Boolean);
      delete data.subjectsStr;
      this._addTeacher(data);
      this.toast('講師を追加しました');
      this.closeModal();
      this._populateTeacherFilter();
      await this._loadTeachersTable();
    });
  }

  _deleteTeacher(id) {
    if (!this.confirm('この講師を削除しますか？')) return;
    const arr = this._getTeachers().filter(t=>t.id!==id);
    this._saveTeachers(arr);
    this.toast('削除しました', 'warning');
    this._loadTeachersTable();
  }

  _navigate_teachers() {
    document.querySelector('[data-tab="wa-teachers"]')?.click();
  }
}
