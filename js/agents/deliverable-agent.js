/**
 * deliverable-agent.js
 * 成果物管理エージェント
 * - 宿題・課題・テストの管理
 * - 提出状況の追跡
 * - 期限管理
 */

import { BaseAgent } from './base-agent.js';

const STATUS_MAP = {
  pending:    { label: '未提出',   badge: 'badge-warning' },
  submitted:  { label: '提出済み', badge: 'badge-info'    },
  reviewed:   { label: '添削済み', badge: 'badge-success' },
  completed:  { label: '完了',     badge: 'badge-success' },
  overdue:    { label: '期限切れ', badge: 'badge-danger'  },
};

const TYPE_MAP = {
  homework:   '宿題',
  assignment: '課題',
  test:       'テスト',
  report:     'レポート',
  project:    'プロジェクト',
  other:      'その他',
};

export class DeliverableAgent extends BaseAgent {
  constructor() {
    super('deliverable', '成果物管理', '📁', 'deliverables');
  }

  render() {
    return `
      <h1 class="page-title">📁 成果物管理エージェント</h1>

      <div class="tabs" id="dl-tabs">
        <button class="tab-btn active" data-tab="dl-active">進行中</button>
        <button class="tab-btn" data-tab="dl-all">全件</button>
        <button class="tab-btn" data-tab="dl-stats">統計</button>
      </div>

      <!-- 進行中 -->
      <div id="dl-active" class="tab-content active">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📋 進行中の課題</div>
            <button class="btn btn-primary" data-action="add" id="dl-add-btn">＋ 課題追加</button>
          </div>
          <div id="dl-active-list">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 全件 -->
      <div id="dl-all" class="tab-content">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 全課題</div>
            <div class="flex gap-1">
              <select id="dl-status-filter" class="form-control" style="width:120px">
                <option value="">全ステータス</option>
                ${Object.entries(STATUS_MAP).map(([v,{label}])=>`<option value="${v}">${label}</option>`).join('')}
              </select>
              <select id="dl-type-filter" class="form-control" style="width:120px">
                <option value="">全種別</option>
                ${Object.entries(TYPE_MAP).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}
              </select>
              <button class="btn btn-ghost btn-sm" id="dl-filter-btn">絞り込み</button>
            </div>
          </div>
          <div id="dl-all-list">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- 統計 -->
      <div id="dl-stats" class="tab-content">
        <div class="card">
          <div class="card-header"><div class="card-title">📊 課題統計</div></div>
          <div id="dl-stats-content">
            <div class="loading-spinner"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    window._dlAgent = this;

    // タブ
    document.getElementById('dl-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('#dl-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('#dl-active,#dl-all,#dl-stats').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });

    document.getElementById('dl-add-btn').addEventListener('click', () => this._openAddModal());
    document.getElementById('dl-filter-btn').addEventListener('click', () => {
      const status = document.getElementById('dl-status-filter').value;
      const type   = document.getElementById('dl-type-filter').value;
      this._loadAllList(status, type);
    });

    await Promise.all([
      this._loadActiveList(),
      this._loadAllList(),
      this._loadStats(),
    ]);
  }

  handleCommand(cmd, action) {
    if (action === 'add') setTimeout(() => this._openAddModal(), 200);
    return true;
  }

  /* ===== 進行中リスト ===== */
  async _loadActiveList() {
    const el = document.getElementById('dl-active-list');
    if (!el) return;
    const all = await this.getAll('dueDate', false);
    // 完了・添削済み以外
    const active = all.filter(d => !['completed'].includes(d.status));

    // 期限切れチェック
    const today = this.today();
    active.forEach(d => {
      if (d.dueDate && d.dueDate < today && d.status === 'pending') d.status = 'overdue';
    });

    if (active.length === 0) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🎉</div>
        <p class="empty-text">進行中の課題はありません！</p>
        <button class="btn btn-primary mt-1" onclick="document.getElementById('dl-add-btn').click()">課題を追加</button>
      </div>`;
      return;
    }

    // 期限が近い順にソート
    active.sort((a,b) => (a.dueDate||'9999-99-99').localeCompare(b.dueDate||'9999-99-99'));

    el.innerHTML = active.map(d => this._deliverableCard(d)).join('');
  }

  _deliverableCard(d) {
    const sm = STATUS_MAP[d.status] || { label: d.status, badge: 'badge-gray' };
    const tm = TYPE_MAP[d.type] || d.type || 'その他';
    const isOverdue = d.dueDate && d.dueDate < this.today() && d.status === 'pending';
    const dueBadge  = isOverdue
      ? `<span class="badge badge-danger">⚠️ 期限切れ</span>`
      : d.dueDate
        ? `<span class="badge badge-gray">期限: ${d.dueDate}</span>`
        : '';

    return `
      <div class="card" style="margin-bottom:8px;padding:14px">
        <div class="flex items-center gap-1 mb-1">
          <span class="badge badge-primary">${tm}</span>
          <span class="badge ${sm.badge}">${sm.label}</span>
          ${dueBadge}
          <span class="flex-1"></span>
          <button class="btn btn-sm btn-ghost btn-icon" onclick="window._dlAgent._editDeliverable('${d.id}')">✏️</button>
          <button class="btn btn-sm btn-danger btn-icon" onclick="window._dlAgent._deleteDeliverable('${d.id}')">🗑️</button>
        </div>
        <div class="fw-bold" style="font-size:15px;margin-bottom:4px">${d.title}</div>
        ${d.description ? `<div class="text-muted" style="font-size:13px">${d.description}</div>` : ''}
        ${d.subject ? `<div class="mt-1"><span class="badge badge-gray">📚 ${d.subject}</span></div>` : ''}
        <div class="flex gap-1 mt-2">
          ${d.status !== 'submitted' ? `<button class="btn btn-sm btn-info" style="color:#fff" onclick="window._dlAgent._updateStatus('${d.id}','submitted')">提出済みにする</button>` : ''}
          ${d.status !== 'reviewed'  ? `<button class="btn btn-sm btn-success" onclick="window._dlAgent._updateStatus('${d.id}','reviewed')">添削済みにする</button>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="window._dlAgent._updateStatus('${d.id}','completed')">完了</button>
        </div>
      </div>`;
  }

  async _updateStatus(id, status) {
    await this.update(id, { status });
    this.toast(`ステータスを「${STATUS_MAP[status]?.label}」に更新しました`);
    await Promise.all([this._loadActiveList(), this._loadAllList(), this._loadStats()]);
  }

  /* ===== 全件リスト ===== */
  async _loadAllList(statusFilter = '', typeFilter = '') {
    const el = document.getElementById('dl-all-list');
    if (!el) return;
    let all = await this.getAll('dueDate', false);

    if (statusFilter) all = all.filter(d => d.status === statusFilter);
    if (typeFilter)   all = all.filter(d => d.type === typeFilter);

    if (all.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>該当する課題がありません</p></div>';
      return;
    }

    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>タイトル</th><th>種別</th><th>科目</th><th>期限</th><th>ステータス</th><th>操作</th></tr></thead>
      <tbody>
        ${all.map(d => {
          const sm = STATUS_MAP[d.status] || { label: d.status, badge: 'badge-gray' };
          return `<tr>
            <td class="fw-bold">${d.title}</td>
            <td>${TYPE_MAP[d.type]||d.type||'-'}</td>
            <td>${d.subject||'-'}</td>
            <td>${d.dueDate||'-'}</td>
            <td><span class="badge ${sm.badge}">${sm.label}</span></td>
            <td class="flex gap-1">
              <button class="btn btn-sm btn-ghost" onclick="window._dlAgent._editDeliverable('${d.id}')">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="window._dlAgent._deleteDeliverable('${d.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
  }

  /* ===== 統計 ===== */
  async _loadStats() {
    const el = document.getElementById('dl-stats-content');
    if (!el) return;
    const all = await this.getAll('createdAt');
    if (all.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>データがありません</p></div>';
      return;
    }

    const counts = {};
    Object.keys(STATUS_MAP).forEach(s => counts[s] = 0);
    all.forEach(d => { if (counts[d.status] !== undefined) counts[d.status]++; });

    const byType = {};
    all.forEach(d => { byType[d.type||'other'] = (byType[d.type||'other']||0)+1; });

    el.innerHTML = `
      <div class="stats-grid">
        ${Object.entries(STATUS_MAP).map(([s,{label,badge}])=>`
          <div class="stat-card">
            <div class="stat-label">${label}</div>
            <div class="stat-value">${counts[s]||0}</div>
          </div>`).join('')}
      </div>
      <h4 class="card-title mb-2 mt-2">種別内訳</h4>
      ${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([type,count])=>`
        <div style="margin-bottom:10px">
          <div class="flex items-center gap-1 mb-1">
            <span class="flex-1 fw-bold">${TYPE_MAP[type]||type}</span>
            <span class="badge badge-primary">${count}件</span>
          </div>
          <div class="progress"><div class="progress-bar" style="width:${Math.round(count/all.length*100)}%"></div></div>
        </div>`).join('')}`;
  }

  /* ===== 追加・編集モーダル ===== */
  _openAddModal(existing = null) {
    this.openModal(existing ? '課題を編集' : '課題を追加', `
      <form id="dl-form">
        <div class="form-group">
          <label class="form-label">タイトル <span style="color:red">*</span></label>
          <input type="text" class="form-control" name="title" required
            value="${existing?.title||''}" placeholder="例：英語テキスト p.30-35" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">種別</label>
            <select class="form-control" name="type">
              ${Object.entries(TYPE_MAP).map(([v,l])=>`<option value="${v}" ${(existing?.type||'homework')===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">科目</label>
            <input type="text" class="form-control" name="subject" value="${existing?.subject||''}" placeholder="英語" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">期限</label>
            <input type="date" class="form-control" name="dueDate" value="${existing?.dueDate||''}" />
          </div>
          <div class="form-group">
            <label class="form-label">ステータス</label>
            <select class="form-control" name="status">
              ${Object.entries(STATUS_MAP).map(([v,{label}])=>`<option value="${v}" ${(existing?.status||'pending')===v?'selected':''}>${label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">説明・メモ</label>
          <textarea class="form-control" name="description" rows="3"
            placeholder="詳細や注意事項など">${existing?.description||''}</textarea>
        </div>
        <div class="flex gap-1 mt-2">
          <button type="submit" class="btn btn-primary flex-1">${existing?'保存':'追加'}</button>
          <button type="button" class="btn btn-ghost" onclick="window._dlAgent.closeModal()">キャンセル</button>
        </div>
      </form>`);

    document.getElementById('dl-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if (existing) {
        await this.update(existing.id, data);
        this.toast('課題を更新しました');
      } else {
        await this.add(data);
        this.toast('課題を追加しました');
      }
      this.closeModal();
      await Promise.all([this._loadActiveList(), this._loadAllList(), this._loadStats()]);
    });
  }

  async _editDeliverable(id) {
    const d = await this.getById(id);
    if (d) this._openAddModal(d);
  }

  async _deleteDeliverable(id) {
    if (!this.confirm('この課題を削除しますか？')) return;
    await this.delete(id);
    this.toast('削除しました', 'warning');
    await Promise.all([this._loadActiveList(), this._loadAllList(), this._loadStats()]);
  }
}
