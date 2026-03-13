/**
 * schedule-agent.js
 * 時間割管理エージェント
 * - 週次時間割のグリッド表示・編集
 * - 科目・講師・教室の割り当て
 */

import { BaseAgent } from './base-agent.js';

const DAYS_JP  = ['月', '火', '水', '木', '金', '土', '日'];
const DAYS_EN  = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DOW_MAP  = { monday:0,tuesday:1,wednesday:2,thursday:3,friday:4,saturday:5,sunday:6 };

// デフォルト時間スロット
const TIME_SLOTS = [
  '09:00','10:00','11:00','12:00','13:00','14:00',
  '15:00','16:00','17:00','18:00','19:00','20:00','21:00'
];

const COLORS = [
  '#2563eb','#7c3aed','#059669','#d97706','#dc2626',
  '#0891b2','#c026d3','#65a30d','#ea580c','#0284c7'
];

export class ScheduleAgent extends BaseAgent {
  constructor() {
    super('schedule', '時間割管理', '📅', 'schedules');
  }

  render() {
    return `
      <h1 class="page-title">📅 時間割管理エージェント</h1>

      <div class="tabs" id="sc-tabs">
        <button class="tab-btn active" data-tab="sc-grid">週間時間割</button>
        <button class="tab-btn" data-tab="sc-list">一覧</button>
      </div>

      <!-- 週間グリッド -->
      <div id="sc-grid" class="tab-content active">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📅 週間時間割</div>
            <button class="btn btn-primary" data-action="add" id="sc-add-btn">＋ 授業を追加</button>
          </div>
          <div id="sc-grid-content">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 一覧 -->
      <div id="sc-list" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📋 授業一覧</div>
            <button class="btn btn-primary" id="sc-add-btn2">＋ 授業を追加</button>
          </div>
          <div id="sc-list-content">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    window._scAgent = this;

    // タブ
    document.getElementById('sc-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('#sc-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#sc-grid,#sc-list').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });

    document.getElementById('sc-add-btn').addEventListener('click',  () => this._openAddModal());
    document.getElementById('sc-add-btn2').addEventListener('click', () => this._openAddModal());

    await Promise.all([this._renderGrid(), this._loadList()]);
  }

  handleCommand(cmd, action) {
    if (action === 'add') setTimeout(() => this._openAddModal(), 200);
    return true;
  }

  /* ===== グリッド表示 ===== */
  async _renderGrid() {
    const el = document.getElementById('sc-grid-content');
    if (!el) return;
    const schedules = await this.getAll('createdAt', false);

    // 時間スロット × 曜日のマップ
    const cellMap = {};
    schedules.forEach(s => {
      const key = `${s.dayOfWeek}_${s.timeSlot}`;
      if (!cellMap[key]) cellMap[key] = [];
      cellMap[key].push(s);
    });

    const headerRow = `
      <div class="schedule-header" style="background:var(--surface2)"></div>
      ${DAYS_JP.map(d => `<div class="schedule-header">${d}</div>`).join('')}`;

    const rows = TIME_SLOTS.map((slot, si) => {
      const cells = DAYS_EN.map((day, di) => {
        const key   = `${day}_${slot}`;
        const items = cellMap[key] || [];
        const blocks = items.map(s => `
          <div class="class-block" style="background:${s.color||COLORS[0]}"
            onclick="window._scAgent._editSchedule('${s.id}')" title="${s.subject}">
            ${s.subject}${s.teacher?`<br><span style="opacity:.8;font-size:10px">${s.teacher}</span>`:''}
          </div>`).join('');
        return `<div class="schedule-cell" onclick="window._scAgent._openAddModal('${day}','${slot}')">${blocks}</div>`;
      }).join('');
      return `<div class="schedule-time">${slot}</div>${cells}`;
    });

    el.innerHTML = `
      <div class="schedule-grid" style="margin-bottom:8px">
        ${headerRow}
        ${rows.join('')}
      </div>
      <p class="text-muted" style="font-size:12px">セルをクリックして授業を追加できます</p>`;
  }

  /* ===== 一覧 ===== */
  async _loadList() {
    const el = document.getElementById('sc-list-content');
    if (!el) return;
    const schedules = await this.getAll('dayOfWeek', false);

    if (schedules.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>時間割が登録されていません</p></div>';
      return;
    }

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>曜日</th><th>時限</th><th>科目</th><th>講師</th><th>教室</th><th>生徒</th><th>操作</th></tr></thead>
      <tbody>
        ${schedules.map(s=>`<tr>
          <td>${this._dayLabel(s.dayOfWeek)}</td>
          <td>${s.timeSlot}</td>
          <td><span style="display:inline-flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.color||COLORS[0]};display:inline-block"></span>
            ${s.subject}
          </span></td>
          <td>${s.teacher||'-'}</td>
          <td>${s.room||'-'}</td>
          <td>${s.studentCount||'-'}</td>
          <td class="flex gap-1">
            <button class="btn btn-sm btn-ghost" onclick="window._scAgent._editSchedule('${s.id}')">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="window._scAgent._deleteSchedule('${s.id}')">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  _dayLabel(dayOfWeek) {
    const idx = DOW_MAP[dayOfWeek];
    return idx !== undefined ? DAYS_JP[idx] + '曜日' : dayOfWeek;
  }

  /* ===== 追加モーダル ===== */
  async _openAddModal(defaultDay = '', defaultSlot = '', existing = null) {
    const colorIdx = Math.floor(Math.random() * COLORS.length);
    this.openModal(existing ? '授業を編集' : '授業を追加', `
      <form id="sc-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">曜日 <span style="color:red">*</span></label>
            <select class="form-control" name="dayOfWeek" required>
              ${DAYS_EN.map((d,i) => `<option value="${d}" ${(existing?.dayOfWeek||defaultDay)===d?'selected':''}>${DAYS_JP[i]}曜日</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">開始時刻 <span style="color:red">*</span></label>
            <select class="form-control" name="timeSlot" required>
              ${TIME_SLOTS.map(t => `<option value="${t}" ${(existing?.timeSlot||defaultSlot)===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">科目 <span style="color:red">*</span></label>
            <input type="text" class="form-control" name="subject" required
              value="${existing?.subject||''}" placeholder="数学・英語など" />
          </div>
          <div class="form-group">
            <label class="form-label">担当講師</label>
            <input type="text" class="form-control" name="teacher" value="${existing?.teacher||''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">教室</label>
            <input type="text" class="form-control" name="room" value="${existing?.room||''}" placeholder="A教室" />
          </div>
          <div class="form-group">
            <label class="form-label">生徒数</label>
            <input type="number" class="form-control" name="studentCount" value="${existing?.studentCount||''}" min="1" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">授業時間（分）</label>
          <input type="number" class="form-control" name="duration" value="${existing?.duration||60}" step="30" />
        </div>
        <div class="form-group">
          <label class="form-label">カラー</label>
          <div class="flex gap-1" style="flex-wrap:wrap">
            ${COLORS.map((c,i) => `
              <label style="cursor:pointer">
                <input type="radio" name="color" value="${c}" ${(existing?.color||COLORS[colorIdx])===c?'checked':''} style="display:none" />
                <span style="display:block;width:24px;height:24px;border-radius:50%;background:${c};border:2px solid ${(existing?.color||COLORS[colorIdx])===c?'#000':'transparent'};transition:border-color .15s"
                  onclick="document.querySelectorAll('[name=color]~span').forEach(s=>s.style.borderColor='transparent');this.style.borderColor='#000'">
                </span>
              </label>`).join('')}
          </div>
        </div>
        <div class="flex gap-1 mt-2">
          <button type="submit" class="btn btn-primary flex-1">${existing ? '保存' : '追加'}</button>
          <button type="button" class="btn btn-ghost" onclick="window._scAgent.closeModal()">キャンセル</button>
        </div>
      </form>`);

    document.getElementById('sc-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if (existing) {
        await this.update(existing.id, data);
        this.toast('時間割を更新しました');
      } else {
        await this.add(data);
        this.toast('授業を追加しました');
      }
      this.closeModal();
      await Promise.all([this._renderGrid(), this._loadList()]);
    });
  }

  async _editSchedule(id) {
    const s = await this.getById(id);
    if (s) await this._openAddModal('', '', s);
  }

  async _deleteSchedule(id) {
    if (!this.confirm('この授業を削除しますか？')) return;
    await this.delete(id);
    this.toast('削除しました', 'warning');
    await Promise.all([this._renderGrid(), this._loadList()]);
  }
}
