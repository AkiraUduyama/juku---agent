/**
 * attendance-agent.js
 * 出席管理エージェント
 * - 生徒マスタ管理（students コレクション）
 * - 日次出席記録（attendance コレクション）
 */

import { BaseAgent } from './base-agent.js';

export class AttendanceAgent extends BaseAgent {
  constructor() {
    super('attendance', '出席管理', '📋', 'attendance');
    // 生徒マスタ用の別インスタンスとして同クラスを流用
    this._studentCol = 'students';
  }

  /* ===== 生徒 CRUD ===== */
  async getStudents()   { return this._delegateGetAll(this._studentCol); }
  async addStudent(d)   { return this._delegateAdd(this._studentCol, d); }
  async deleteStudent(id) { return this._delegateDelete(this._studentCol, id); }

  _delegateGetAll(col) {
    const saved = JSON.parse(localStorage.getItem(`juku_${col}`) || '[]');
    return Promise.resolve(saved);
  }
  _delegateAdd(col, data) {
    const arr = JSON.parse(localStorage.getItem(`juku_${col}`) || '[]');
    const r   = { id: `ls_${Date.now()}`, ...data, createdAt: new Date().toISOString() };
    arr.unshift(r);
    localStorage.setItem(`juku_${col}`, JSON.stringify(arr));
    return Promise.resolve(r);
  }
  _delegateDelete(col, id) {
    const arr = JSON.parse(localStorage.getItem(`juku_${col}`) || '[]').filter(r => r.id !== id);
    localStorage.setItem(`juku_${col}`, JSON.stringify(arr));
    return Promise.resolve(true);
  }

  /* ===== レンダリング ===== */
  render() {
    return `
      <h1 class="page-title">📋 出席管理エージェント</h1>

      <div class="tabs" id="att-tabs">
        <button class="tab-btn active" data-tab="att-daily">本日の出席</button>
        <button class="tab-btn" data-tab="att-history">出席履歴</button>
        <button class="tab-btn" data-tab="att-students">生徒マスタ</button>
      </div>

      <!-- 本日の出席 -->
      <div id="att-daily" class="tab-content active">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📅 出席記録 ― <span id="att-date-label"></span></div>
            <div class="flex gap-1">
              <input type="date" id="att-date" class="form-control" style="width:160px" />
              <button class="btn btn-primary" data-action="record" id="att-add-btn">＋ 出席追加</button>
            </div>
          </div>
          <div id="att-daily-table">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 出席履歴 -->
      <div id="att-history" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 出席履歴</div>
            <div class="flex gap-1">
              <input type="month" id="att-month" class="form-control" style="width:140px" />
              <button class="btn btn-ghost btn-sm" id="att-history-load">表示</button>
            </div>
          </div>
          <div id="att-history-table">
            <div class="empty-state"><div class="empty-icon">📂</div><p>月を選択してください</p></div>
          </div>
        </div>
      </div>

      <!-- 生徒マスタ -->
      <div id="att-students" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">👥 生徒マスタ</div>
            <button class="btn btn-primary" id="att-student-add-btn">＋ 生徒追加</button>
          </div>
          <div id="att-students-table">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    // タブ切り替え
    document.getElementById('att-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('#att-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });

    // 日付初期化
    const dateInput = document.getElementById('att-date');
    dateInput.value = this.today();
    document.getElementById('att-date-label').textContent = new Date().toLocaleDateString('ja-JP');
    dateInput.addEventListener('change', () => this._loadDailyTable(dateInput.value));

    // 出席追加ボタン
    document.getElementById('att-add-btn').addEventListener('click', () => this._openAddModal());

    // 履歴表示
    const monthInput = document.getElementById('att-month');
    monthInput.value = this.today().slice(0,7);
    document.getElementById('att-history-load').addEventListener('click', () => this._loadHistory(monthInput.value));

    // 生徒追加ボタン
    document.getElementById('att-student-add-btn').addEventListener('click', () => this._openStudentModal());

    // 初期データ読み込み
    await Promise.all([
      this._loadDailyTable(this.today()),
      this._loadStudentsTable(),
    ]);
  }

  handleCommand(cmd, action) {
    if (action === 'record') {
      setTimeout(() => this._openAddModal(), 200);
    }
    return true;
  }

  /* ===== 本日出席テーブル ===== */
  async _loadDailyTable(date) {
    const el = document.getElementById('att-daily-table');
    if (!el) return;
    const label = document.getElementById('att-date-label');
    if (label) label.textContent = new Date(date + 'T00:00:00').toLocaleDateString('ja-JP');

    el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    const records = await this.getWhere('date', '==', date);
    const students = await this.getStudents();

    if (records.length === 0 && students.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>
        <p class="empty-text">生徒マスタを登録してから出席を記録してください</p></div>`;
      return;
    }

    // 生徒マスタをマップ化
    const stuMap = Object.fromEntries(students.map(s => [s.id, s]));

    // 全生徒 × 本日記録をマージ
    const rows = students.map(s => {
      const rec = records.find(r => r.studentId === s.id);
      return { student: s, record: rec };
    });

    const present = rows.filter(r => r.record?.status === 'present').length;
    const absent  = rows.filter(r => r.record?.status === 'absent').length;
    const late    = rows.filter(r => r.record?.status === 'late').length;
    const unknown = rows.filter(r => !r.record).length;

    el.innerHTML = `
      <div class="flex gap-2 mb-2">
        <span class="badge badge-success">出席 ${present}</span>
        <span class="badge badge-danger">欠席 ${absent}</span>
        <span class="badge badge-warning">遅刻 ${late}</span>
        <span class="badge badge-gray">未記録 ${unknown}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>生徒名</th><th>学年</th><th>ステータス</th><th>備考</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.map(({ student: s, record: r }) => `
            <tr>
              <td><span class="fw-bold">${s.name}</span></td>
              <td>${s.grade || '-'}</td>
              <td>${this._statusBadge(r?.status)}</td>
              <td>${r?.note || ''}</td>
              <td class="flex gap-1">
                <button class="btn btn-sm btn-success" onclick="window._attAgent._setStatus('${s.id}','${date}','present',${r ? `'${r.id}'` : 'null'})">出席</button>
                <button class="btn btn-sm btn-danger"  onclick="window._attAgent._setStatus('${s.id}','${date}','absent',${r ? `'${r.id}'` : 'null'})">欠席</button>
                <button class="btn btn-sm btn-warning" style="color:#fff" onclick="window._attAgent._setStatus('${s.id}','${date}','late',${r ? `'${r.id}'` : 'null'})">遅刻</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

    window._attAgent = this;
    window._attCurrentDate = date;
  }

  _statusBadge(status) {
    if (!status)           return '<span class="badge badge-gray">未記録</span>';
    if (status==='present') return '<span class="badge badge-success">出席</span>';
    if (status==='absent')  return '<span class="badge badge-danger">欠席</span>';
    if (status==='late')    return '<span class="badge badge-warning">遅刻</span>';
    return `<span class="badge badge-gray">${status}</span>`;
  }

  async _setStatus(studentId, date, status, existingId) {
    if (existingId) {
      await this.update(existingId, { status });
    } else {
      await this.add({ studentId, date, status, note: '' });
    }
    this.toast(`出席ステータスを「${status === 'present' ? '出席' : status === 'absent' ? '欠席' : '遅刻'}」に更新しました`);
    await this._loadDailyTable(date);
  }

  /* ===== 出席追加モーダル ===== */
  async _openAddModal() {
    const students = await this.getStudents();
    const date = window._attCurrentDate || this.today();

    this.openModal('出席を記録', `
      <form id="att-form">
        <div class="form-group">
          <label class="form-label">生徒</label>
          <select class="form-control" name="studentId" required>
            <option value="">選択してください</option>
            ${students.map(s => `<option value="${s.id}">${s.name} (${s.grade||'-'})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">日付</label>
          <input type="date" class="form-control" name="date" value="${date}" required />
        </div>
        <div class="form-group">
          <label class="form-label">ステータス</label>
          <select class="form-control" name="status">
            <option value="present">出席</option>
            <option value="absent">欠席</option>
            <option value="late">遅刻</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">備考</label>
          <input type="text" class="form-control" name="note" placeholder="連絡事項など" />
        </div>
        <div class="flex gap-1 mt-2">
          <button type="submit" class="btn btn-primary flex-1">記録する</button>
          <button type="button" class="btn btn-ghost" onclick="window._attAgent.closeModal()">キャンセル</button>
        </div>
      </form>`);

    document.getElementById('att-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      await this.add(data);
      this.toast('出席を記録しました');
      this.closeModal();
      await this._loadDailyTable(data.date);
    });
  }

  /* ===== 履歴 ===== */
  async _loadHistory(month) {
    const el = document.getElementById('att-history-table');
    if (!el) return;
    el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    const start = `${month}-01`;
    const end   = `${month}-31`;
    const [records, students] = await Promise.all([
      this.getWhere('date', '>=', start, 'date'),
      this.getStudents(),
    ]);
    const filtered = records.filter(r => r.date <= end);
    const stuMap = Object.fromEntries(students.map(s => [s.id, s]));

    if (filtered.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>この月の記録はありません</p></div>';
      return;
    }

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>日付</th><th>生徒名</th><th>ステータス</th><th>備考</th></tr></thead>
      <tbody>
        ${filtered.map(r => `<tr>
          <td>${r.date}</td>
          <td>${stuMap[r.studentId]?.name || '不明'}</td>
          <td>${this._statusBadge(r.status)}</td>
          <td>${r.note || ''}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ===== 生徒マスタ ===== */
  async _loadStudentsTable() {
    const el = document.getElementById('att-students-table');
    if (!el) return;
    const students = await this.getStudents();

    if (students.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p class="empty-text">生徒が登録されていません</p></div>';
      return;
    }

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>氏名</th><th>学年</th><th>科目</th><th>連絡先</th><th>操作</th></tr></thead>
      <tbody>
        ${students.map(s => `<tr>
          <td class="fw-bold">${s.name}</td>
          <td>${s.grade || '-'}</td>
          <td>${(s.subjects||[]).join('・') || '-'}</td>
          <td>${s.phone || '-'}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="window._attAgent._deleteStudent('${s.id}')">削除</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>`;
    window._attAgent = this;
  }

  _openStudentModal() {
    this.openModal('生徒を追加', `
      <form id="student-form">
        <div class="form-group">
          <label class="form-label">氏名 <span style="color:red">*</span></label>
          <input type="text" class="form-control" name="name" required placeholder="山田 太郎" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">学年</label>
            <select class="form-control" name="grade">
              <option value="">未設定</option>
              <option>中1</option><option>中2</option><option>中3</option>
              <option>高1</option><option>高2</option><option>高3</option>
              <option>浪人</option><option>小学生</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">連絡先</label>
            <input type="tel" class="form-control" name="phone" placeholder="090-0000-0000" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">受講科目（カンマ区切り）</label>
          <input type="text" class="form-control" name="subjectsStr" placeholder="数学,英語,物理" />
        </div>
        <div class="form-group">
          <label class="form-label">保護者連絡先</label>
          <input type="tel" class="form-control" name="guardianPhone" placeholder="090-0000-0000" />
        </div>
        <div class="flex gap-1 mt-2">
          <button type="submit" class="btn btn-primary flex-1">追加する</button>
          <button type="button" class="btn btn-ghost" onclick="window._attAgent.closeModal()">キャンセル</button>
        </div>
      </form>`);

    document.getElementById('student-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.subjects = data.subjectsStr.split(',').map(s => s.trim()).filter(Boolean);
      delete data.subjectsStr;
      await this._delegateAdd(this._studentCol, data);
      this.toast('生徒を追加しました');
      this.closeModal();
      await this._loadStudentsTable();
    });
  }

  async _deleteStudent(id) {
    if (!this.confirm('この生徒を削除しますか？')) return;
    await this._delegateDelete(this._studentCol, id);
    this.toast('生徒を削除しました', 'warning');
    await this._loadStudentsTable();
  }
}
