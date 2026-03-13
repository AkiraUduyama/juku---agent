/**
 * report-agent.js
 * レポート出力エージェント
 * - 月次総合レポートの生成
 * - 出席率・授業時間・勤怠サマリー・課題状況
 * - CSV / 印刷エクスポート
 */

import { BaseAgent } from './base-agent.js';

export class ReportAgent extends BaseAgent {
  constructor() {
    super('report', 'レポート出力', '📊', 'reports');
    this._agents = {}; // 他エージェントへの参照
  }

  /** 他エージェントへの参照を注入（メインエージェントから呼ばれる） */
  setAgents(agents) {
    this._agents = agents;
  }

  render() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const prevMonth = (() => {
      const d = new Date(now.getFullYear(), now.getMonth()-1, 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    })();

    return `
      <h1 class="page-title">📊 レポート出力エージェント</h1>

      <div class="card">
        <div class="card-header">
          <div class="card-title">📅 レポート設定</div>
        </div>
        <div class="form-row three" style="align-items:flex-end">
          <div class="form-group">
            <label class="form-label">対象月</label>
            <input type="month" id="rp-month" class="form-control" value="${thisMonth}" />
          </div>
          <div class="form-group">
            <label class="form-label">レポート種別</label>
            <select id="rp-type" class="form-control">
              <option value="monthly">月次総合レポート</option>
              <option value="attendance">出席レポート</option>
              <option value="classtime">授業時間レポート</option>
              <option value="workatt">勤怠レポート</option>
              <option value="deliverable">課題レポート</option>
            </select>
          </div>
          <div class="form-group">
            <div class="flex gap-1">
              <button class="btn btn-primary flex-1" data-action="generate" id="rp-generate-btn">📊 レポート生成</button>
            </div>
          </div>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" onclick="window._rpAgent._quickReport('${thisMonth}')">今月</button>
          <button class="btn btn-ghost btn-sm" onclick="window._rpAgent._quickReport('${prevMonth}')">先月</button>
        </div>
      </div>

      <!-- レポート表示エリア -->
      <div id="rp-output" class="hidden">
        <div class="card">
          <div class="card-header">
            <div class="card-title" id="rp-title">レポート</div>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-sm" id="rp-csv-btn">📥 CSVダウンロード</button>
              <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ 印刷</button>
            </div>
          </div>
          <div id="rp-content"></div>
        </div>
      </div>

      <div id="rp-placeholder" class="empty-state" style="padding:60px 20px">
        <div class="empty-icon">📊</div>
        <p class="empty-text">月を選択してレポートを生成してください</p>
        <p class="text-muted" style="font-size:12px">出席率・授業時間・勤怠・課題状況を一括集計します</p>
      </div>
    `;
  }

  async init() {
    window._rpAgent = this;
    document.getElementById('rp-generate-btn').addEventListener('click', async () => {
      const month = document.getElementById('rp-month').value;
      const type  = document.getElementById('rp-type').value;
      await this._generateReport(month, type);
    });
  }

  handleCommand(cmd, action) {
    if (action === 'generate') {
      setTimeout(() => document.getElementById('rp-generate-btn')?.click(), 200);
    }
    return true;
  }

  _quickReport(month) {
    const monthInput = document.getElementById('rp-month');
    if (monthInput) monthInput.value = month;
    document.getElementById('rp-generate-btn')?.click();
  }

  /* ===== レポート生成メイン ===== */
  async _generateReport(month, type) {
    const outputEl = document.getElementById('rp-output');
    const contentEl = document.getElementById('rp-content');
    const titleEl   = document.getElementById('rp-title');
    const placeholderEl = document.getElementById('rp-placeholder');

    contentEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>データ収集中...</p></div>';
    outputEl.classList.remove('hidden');
    if (placeholderEl) placeholderEl.classList.add('hidden');

    const start = `${month}-01`;
    const end   = `${month}-31`;
    const [y, m] = month.split('-');
    const label  = `${y}年${parseInt(m)}月`;

    try {
      // 全エージェントからデータ収集
      const [attRecords, students, sessions, workRecs, deliverables] = await Promise.all([
        this._fetch(this._agents.att, 'date', '>=', start),
        this._fetchAll(this._agents.att, this._agents.att?._studentCol),
        this._fetch(this._agents.ct,  'date', '>=', start),
        this._fetch(this._agents.wa,  'date', '>=', start),
        this._fetchAll2(this._agents.dl),
      ]);

      // 期間絞り込み
      const attInRange  = attRecords.filter(r => r.date <= end);
      const sessInRange = sessions.filter(r => r.date <= end);
      const workInRange = workRecs.filter(r => r.date <= end);

      let html = '';

      if (type === 'monthly' || type === 'attendance') {
        html += this._buildAttendanceSection(label, attInRange, students);
      }
      if (type === 'monthly' || type === 'classtime') {
        html += this._buildClassTimeSection(label, sessInRange);
      }
      if (type === 'monthly' || type === 'workatt') {
        html += this._buildWorkAttSection(label, workInRange);
      }
      if (type === 'monthly' || type === 'deliverable') {
        html += this._buildDeliverableSection(label, deliverables);
      }

      const typeLabels = {
        monthly:'月次総合レポート', attendance:'出席レポート',
        classtime:'授業時間レポート', workatt:'勤怠レポート', deliverable:'課題レポート'
      };
      titleEl.textContent = `${label} ${typeLabels[type] || 'レポート'}`;

      contentEl.innerHTML = `
        <div class="report-meta" style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
          生成日時: ${new Date().toLocaleString('ja-JP')} | 対象: ${label}
        </div>
        ${html || '<div class="empty-state"><div class="empty-icon">📭</div><p>この月のデータがありません</p></div>'}`;

      // CSV生成準備
      document.getElementById('rp-csv-btn').onclick = () => {
        this._downloadCsv(month, type, { attInRange, students, sessInRange, workInRange, deliverables });
      };

      await this.add({ type, month, generatedAt: new Date().toISOString() });
      this.toast('レポートを生成しました');

    } catch (e) {
      contentEl.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>エラーが発生しました: ${e.message}</p></div>`;
      this.toast('レポート生成に失敗しました', 'error');
    }
  }

  /* ===== 各セクション ===== */
  _buildAttendanceSection(label, records, students) {
    const total    = records.length;
    const present  = records.filter(r=>r.status==='present').length;
    const absent   = records.filter(r=>r.status==='absent').length;
    const late     = records.filter(r=>r.status==='late').length;
    const rate     = total > 0 ? Math.round(present/total*100) : 0;

    // 生徒別集計
    const stuMap = Object.fromEntries((students||[]).map(s=>[s.id,s]));
    const byStu  = {};
    records.forEach(r => {
      const name = stuMap[r.studentId]?.name || r.studentId || '不明';
      if (!byStu[name]) byStu[name] = { present:0, absent:0, late:0 };
      byStu[name][r.status] = (byStu[name][r.status]||0)+1;
    });

    return `
      <div class="report-section">
        <h4>📋 出席状況</h4>
        <div class="stats-grid">
          <div class="stat-card primary"><div class="stat-label">記録件数</div><div class="stat-value">${total}</div></div>
          <div class="stat-card success"><div class="stat-label">出席</div><div class="stat-value">${present}</div></div>
          <div class="stat-card danger"><div class="stat-label">欠席</div><div class="stat-value">${absent}</div></div>
          <div class="stat-card warning"><div class="stat-label">遅刻</div><div class="stat-value">${late}</div></div>
        </div>
        <div class="mb-2">
          <div class="flex items-center gap-1 mb-1">
            <span class="flex-1 fw-bold">出席率</span>
            <span class="fw-bold text-primary">${rate}%</span>
          </div>
          <div class="progress"><div class="progress-bar ${rate>=80?'success':rate>=60?'warning':'danger'}" style="width:${rate}%"></div></div>
        </div>
        ${Object.keys(byStu).length > 0 ? `
          <div class="table-wrap"><table>
            <thead><tr><th>生徒名</th><th>出席</th><th>欠席</th><th>遅刻</th><th>出席率</th></tr></thead>
            <tbody>
              ${Object.entries(byStu).map(([name,d])=>{
                const tot = d.present+d.absent+d.late;
                const r   = tot>0?Math.round(d.present/tot*100):0;
                return `<tr>
                  <td class="fw-bold">${name}</td>
                  <td>${d.present}</td><td>${d.absent}</td><td>${d.late}</td>
                  <td><span class="badge ${r>=80?'badge-success':r>=60?'badge-warning':'badge-danger'}">${r}%</span></td>
                </tr>`;
              }).join('')}
            </tbody></table></div>` : ''}
      </div>`;
  }

  _buildClassTimeSection(label, sessions) {
    const total = sessions.reduce((s,r)=>s+(r.duration||0),0);
    const bySubject = {};
    sessions.forEach(r => {
      if (!bySubject[r.subject]) bySubject[r.subject] = { count:0, mins:0 };
      bySubject[r.subject].count++;
      bySubject[r.subject].mins += r.duration||0;
    });

    return `
      <div class="report-section">
        <h4>⏱️ 授業時間</h4>
        <div class="stats-grid">
          <div class="stat-card success"><div class="stat-label">総授業時間</div><div class="stat-value">${this.minsToHM(total)}</div></div>
          <div class="stat-card info"><div class="stat-label">授業コマ数</div><div class="stat-value">${sessions.length}</div></div>
        </div>
        ${Object.keys(bySubject).length > 0 ? `
          <div class="table-wrap"><table>
            <thead><tr><th>科目</th><th>コマ数</th><th>合計時間</th><th>割合</th></tr></thead>
            <tbody>
              ${Object.entries(bySubject).sort((a,b)=>b[1].mins-a[1].mins).map(([sub,d])=>`<tr>
                <td class="fw-bold">${sub}</td>
                <td>${d.count}</td>
                <td>${this.minsToHM(d.mins)}</td>
                <td>${total>0?Math.round(d.mins/total*100):0}%</td>
              </tr>`).join('')}
            </tbody></table></div>` : '<p class="text-muted">データなし</p>'}
      </div>`;
  }

  _buildWorkAttSection(label, records) {
    const totalWork     = records.reduce((s,r)=>s+(r.workMins||0),0);
    const totalOvertime = records.reduce((s,r)=>s+(r.overtime||0),0);
    const byTeacher = {};
    records.forEach(r => {
      const name = r.teacherName || r.teacherId || '不明';
      if (!byTeacher[name]) byTeacher[name] = { days:0, work:0, ot:0 };
      byTeacher[name].days++;
      byTeacher[name].work += r.workMins||0;
      byTeacher[name].ot   += r.overtime||0;
    });

    return `
      <div class="report-section">
        <h4>👤 勤怠状況</h4>
        <div class="stats-grid">
          <div class="stat-card primary"><div class="stat-label">出勤延べ日数</div><div class="stat-value">${records.length}日</div></div>
          <div class="stat-card success"><div class="stat-label">総勤務時間</div><div class="stat-value">${this.minsToHM(totalWork)}</div></div>
          <div class="stat-card warning"><div class="stat-label">総残業時間</div><div class="stat-value">${this.minsToHM(totalOvertime)}</div></div>
        </div>
        ${Object.keys(byTeacher).length > 0 ? `
          <div class="table-wrap"><table>
            <thead><tr><th>講師名</th><th>出勤日数</th><th>勤務時間</th><th>残業</th></tr></thead>
            <tbody>
              ${Object.entries(byTeacher).map(([name,d])=>`<tr>
                <td class="fw-bold">${name}</td>
                <td>${d.days}日</td>
                <td>${this.minsToHM(d.work)}</td>
                <td class="${d.ot>0?'text-danger':''}">${d.ot>0?this.minsToHM(d.ot):'なし'}</td>
              </tr>`).join('')}
            </tbody></table></div>` : '<p class="text-muted">データなし</p>'}
      </div>`;
  }

  _buildDeliverableSection(label, deliverables) {
    const STATUS_LABELS = {
      pending:'未提出', submitted:'提出済み', reviewed:'添削済み', completed:'完了', overdue:'期限切れ'
    };
    const bySt = {};
    deliverables.forEach(d => { bySt[d.status] = (bySt[d.status]||0)+1; });

    return `
      <div class="report-section">
        <h4>📁 課題状況</h4>
        <div class="stats-grid">
          ${Object.entries(bySt).map(([st,cnt])=>`
            <div class="stat-card"><div class="stat-label">${STATUS_LABELS[st]||st}</div><div class="stat-value">${cnt}</div></div>
          `).join('')}
        </div>
        ${deliverables.length > 0 ? `
          <div class="table-wrap"><table>
            <thead><tr><th>タイトル</th><th>種別</th><th>期限</th><th>ステータス</th></tr></thead>
            <tbody>
              ${deliverables.slice(0,20).map(d=>`<tr>
                <td>${d.title}</td>
                <td>${d.type||'-'}</td>
                <td>${d.dueDate||'-'}</td>
                <td>${STATUS_LABELS[d.status]||d.status}</td>
              </tr>`).join('')}
            </tbody></table></div>` : '<p class="text-muted">データなし</p>'}
      </div>`;
  }

  /* ===== CSV エクスポート ===== */
  _downloadCsv(month, type, data) {
    let csv = '';
    const BOM = '\uFEFF'; // Excel用BOM

    if (type === 'attendance' || type === 'monthly') {
      csv += '=== 出席記録 ===\n';
      csv += '日付,生徒ID,ステータス,備考\n';
      data.attInRange.forEach(r => {
        csv += `${r.date},${r.studentId},${r.status},${r.note||''}\n`;
      });
      csv += '\n';
    }
    if (type === 'classtime' || type === 'monthly') {
      csv += '=== 授業時間記録 ===\n';
      csv += '日付,科目,開始,終了,時間(分),講師\n';
      data.sessInRange.forEach(r => {
        csv += `${r.date},${r.subject},${r.startTime||''},${r.endTime||''},${r.duration||''},${r.teacher||''}\n`;
      });
      csv += '\n';
    }
    if (type === 'workatt' || type === 'monthly') {
      csv += '=== 勤怠記録 ===\n';
      csv += '日付,講師名,出勤,退勤,勤務(分),残業(分)\n';
      data.workInRange.forEach(r => {
        csv += `${r.date},${r.teacherName||r.teacherId||''},${r.checkIn||''},${r.checkOut||''},${r.workMins||''},${r.overtime||''}\n`;
      });
      csv += '\n';
    }
    if (type === 'deliverable' || type === 'monthly') {
      csv += '=== 課題一覧 ===\n';
      csv += 'タイトル,種別,科目,期限,ステータス\n';
      data.deliverables.forEach(d => {
        csv += `${d.title},${d.type||''},${d.subject||''},${d.dueDate||''},${d.status||''}\n`;
      });
    }

    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `juku_report_${month}_${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('CSVをダウンロードしました');
  }

  /* ===== データ取得ヘルパー ===== */
  async _fetch(agent, field, op, value) {
    if (!agent) return [];
    try { return await agent.getWhere(field, op, value); } catch { return []; }
  }

  async _fetchAll(agent, colOverride) {
    if (!agent) return [];
    try {
      if (colOverride) {
        return JSON.parse(localStorage.getItem(`juku_${colOverride}`) || '[]');
      }
      return await agent.getAll();
    } catch { return []; }
  }

  async _fetchAll2(agent) {
    if (!agent) return [];
    try { return await agent.getAll('createdAt', false); } catch { return []; }
  }
}
