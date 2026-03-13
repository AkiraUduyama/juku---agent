/**
 * alarm-agent.js
 * アラームエージェント
 * - アラームの設定・管理（毎日/曜日指定/一度のみ）
 * - ブラウザ通知 (Notification API)
 * - 定期チェック（1分毎）
 */

import { BaseAgent } from './base-agent.js';

const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

export class AlarmAgent extends BaseAgent {
  constructor() {
    super('alarm', 'アラーム', '🔔', 'alarms');
    this._checkInterval = null;
    this._firedToday    = new Set(); // 本日発火済みID
  }

  render() {
    return `
      <h1 class="page-title">🔔 アラームエージェント</h1>

      <div class="card">
        <div class="card-header">
          <div class="card-title">⏰ アラーム一覧</div>
          <button class="btn btn-primary" data-action="add" id="alarm-add-btn">＋ アラーム追加</button>
        </div>
        <div id="alarm-list">
          <div class="loading-spinner"><div class="spinner"></div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">📋 通知ログ</div>
          <button class="btn btn-ghost btn-sm" id="alarm-clear-log">ログをクリア</button>
        </div>
        <div id="alarm-log" style="max-height:200px;overflow-y:auto;font-size:13px;color:var(--text-muted)">
          <div class="empty-state" style="padding:16px"><p>通知はまだありません</p></div>
        </div>
      </div>
    `;
  }

  async init() {
    window._alarmAgent = this;

    document.getElementById('alarm-add-btn').addEventListener('click', () => this._openAddModal());
    document.getElementById('alarm-clear-log').addEventListener('click', () => {
      document.getElementById('alarm-log').innerHTML = '<div class="empty-state" style="padding:16px"><p>通知はまだありません</p></div>';
    });

    await this._loadAlarmList();
    this._startChecker();
    this._requestNotificationPermission();
  }

  handleCommand(cmd, action) {
    if (action === 'add') setTimeout(() => this._openAddModal(), 200);
    return true;
  }

  /* ===== アラームリスト表示 ===== */
  async _loadAlarmList() {
    const el = document.getElementById('alarm-list');
    if (!el) return;
    const alarms = await this.getAll('createdAt', false);

    if (alarms.length === 0) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🔕</div>
        <p class="empty-text">アラームが設定されていません</p>
        <button class="btn btn-primary mt-1" onclick="document.getElementById('alarm-add-btn').click()">最初のアラームを追加</button>
      </div>`;
      return;
    }

    el.innerHTML = alarms.map(a => this._alarmItemHtml(a)).join('');
    window._alarmAgent = this;
  }

  _alarmItemHtml(a) {
    const repeatLabel = this._repeatLabel(a);
    return `
      <div class="alarm-item" id="alarm-item-${a.id}">
        <div class="alarm-time">${a.time || '--:--'}</div>
        <div class="alarm-info">
          <div class="alarm-title">${a.title || 'アラーム'}</div>
          <div class="alarm-meta">${repeatLabel}${a.message ? ` ― ${a.message}` : ''}</div>
        </div>
        <span class="badge ${a.enabled===false?'badge-gray':'badge-success'}">${a.enabled===false?'無効':'有効'}</span>
        <label class="toggle">
          <input type="checkbox" ${a.enabled!==false?'checked':''} onchange="window._alarmAgent._toggleAlarm('${a.id}', this.checked)" />
          <span class="toggle-slider"></span>
        </label>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="window._alarmAgent._editAlarm('${a.id}')">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="window._alarmAgent._deleteAlarm('${a.id}')">🗑️</button>
      </div>`;
  }

  _repeatLabel(a) {
    if (a.repeat === 'daily') return '🔄 毎日';
    if (a.repeat === 'weekly' && a.days?.length > 0)
      return `🔄 毎週${a.days.map(d => DAYS_JP[d]).join('・')}`;
    return '🕐 一度のみ';
  }

  /* ===== アラーム追加モーダル ===== */
  _openAddModal(existing = null) {
    const title = existing ? 'アラームを編集' : 'アラームを追加';
    this.openModal(title, `
      <form id="alarm-form">
        <div class="form-group">
          <label class="form-label">タイトル <span style="color:red">*</span></label>
          <input type="text" class="form-control" name="title" required
            value="${existing?.title||''}" placeholder="例：授業開始リマインダー" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">時刻 <span style="color:red">*</span></label>
            <input type="time" class="form-control" name="time" required value="${existing?.time||''}" />
          </div>
          <div class="form-group">
            <label class="form-label">繰り返し</label>
            <select class="form-control" name="repeat" id="alarm-repeat-sel" onchange="window._alarmAgent._toggleDays(this.value)">
              <option value="once"   ${existing?.repeat==='once'||!existing?'selected':''}>一度のみ</option>
              <option value="daily"  ${existing?.repeat==='daily'?'selected':''}>毎日</option>
              <option value="weekly" ${existing?.repeat==='weekly'?'selected':''}>曜日指定</option>
            </select>
          </div>
        </div>
        <div class="form-group" id="alarm-days-group" style="display:${existing?.repeat==='weekly'?'block':'none'}">
          <label class="form-label">曜日</label>
          <div class="flex gap-1" style="flex-wrap:wrap">
            ${DAYS_JP.map((d, i) => `
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border:1px solid var(--border);border-radius:99px;font-size:13px;
                ${(existing?.days||[]).includes(i)?'background:var(--primary);color:#fff;border-color:var(--primary)':''}">
                <input type="checkbox" name="days" value="${i}"
                  ${(existing?.days||[]).includes(i)?'checked':''}
                  style="display:none"
                  onchange="this.closest('label').style.cssText=this.checked?'display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border:1px solid var(--primary);border-radius:99px;font-size:13px;background:var(--primary);color:#fff;':'display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border:1px solid var(--border);border-radius:99px;font-size:13px;'"
                />${d}曜日
              </label>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">メッセージ</label>
          <textarea class="form-control" name="message" rows="2"
            placeholder="通知に表示するメッセージ">${existing?.message||''}</textarea>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" name="enabled" value="true" ${existing?.enabled!==false?'checked':''} />
            <span>有効にする</span>
          </label>
        </div>
        <div class="flex gap-1 mt-2">
          <button type="submit" class="btn btn-primary flex-1">
            ${existing ? '保存する' : '追加する'}
          </button>
          <button type="button" class="btn btn-ghost" onclick="window._alarmAgent.closeModal()">キャンセル</button>
        </div>
      </form>`);

    document.getElementById('alarm-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd   = new FormData(e.target);
      const data = {
        title:   fd.get('title'),
        time:    fd.get('time'),
        repeat:  fd.get('repeat'),
        message: fd.get('message'),
        enabled: fd.has('enabled'),
        days:    fd.getAll('days').map(Number),
      };

      if (existing) {
        await this.update(existing.id, data);
        this.toast('アラームを更新しました');
      } else {
        await this.add(data);
        this.toast('アラームを追加しました');
      }
      this.closeModal();
      await this._loadAlarmList();
    });
  }

  _toggleDays(val) {
    const g = document.getElementById('alarm-days-group');
    if (g) g.style.display = val === 'weekly' ? 'block' : 'none';
  }

  async _toggleAlarm(id, enabled) {
    await this.update(id, { enabled });
    this.toast(enabled ? 'アラームを有効にしました' : 'アラームを無効にしました');
    // バッジのみ更新
    const item = document.getElementById(`alarm-item-${id}`);
    if (item) {
      const badge = item.querySelector('.badge');
      if (badge) {
        badge.className = `badge ${enabled ? 'badge-success' : 'badge-gray'}`;
        badge.textContent = enabled ? '有効' : '無効';
      }
    }
  }

  async _editAlarm(id) {
    const alarm = await this.getById(id);
    if (alarm) this._openAddModal(alarm);
  }

  async _deleteAlarm(id) {
    if (!this.confirm('このアラームを削除しますか？')) return;
    await this.delete(id);
    this.toast('削除しました', 'warning');
    await this._loadAlarmList();
  }

  /* ===== アラームチェッカー ===== */
  _startChecker() {
    if (this._checkInterval) clearInterval(this._checkInterval);
    this._checkInterval = setInterval(() => this._checkAlarms(), 30000); // 30秒毎
    this._checkAlarms(); // 即実行
  }

  async _checkAlarms() {
    const now  = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const dow  = now.getDay();
    const today = now.toISOString().slice(0, 10);

    // 日付が変わったらfiredセットをリセット
    if (this._lastCheckDate !== today) {
      this._firedToday.clear();
      this._lastCheckDate = today;
    }

    let alarms = [];
    try { alarms = await this.getAll('createdAt', false); } catch { return; }

    for (const a of alarms) {
      if (a.enabled === false) continue;
      if (a.time !== hhmm)    continue;
      if (this._firedToday.has(a.id)) continue;

      // 繰り返し条件チェック
      let shouldFire = false;
      if (a.repeat === 'daily')  shouldFire = true;
      if (a.repeat === 'weekly') shouldFire = (a.days || []).includes(dow);
      if (!a.repeat || a.repeat === 'once') shouldFire = true;

      if (shouldFire) {
        this._fire(a);
        this._firedToday.add(a.id);

        // 一度のみの場合は無効化
        if (!a.repeat || a.repeat === 'once') {
          await this.update(a.id, { enabled: false });
        }
      }
    }
  }

  _fire(alarm) {
    const title = alarm.title || 'アラーム';
    const body  = alarm.message || `${alarm.time} のアラームです`;

    // ブラウザ通知
    if (Notification.permission === 'granted') {
      new Notification(`🔔 ${title}`, { body, icon: '🏫' });
    }

    // Toast
    this.toast(`🔔 ${title}: ${body}`, 'info');

    // ログ追加
    this._addLog(`${new Date().toLocaleTimeString('ja-JP')} ― ${title}: ${body}`);
  }

  _addLog(msg) {
    const el = document.getElementById('alarm-log');
    if (!el) return;
    const empty = el.querySelector('.empty-state');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.style.cssText = 'padding:4px 0;border-bottom:1px solid var(--border)';
    div.textContent = msg;
    el.prepend(div);
  }

  _requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') this.toast('ブラウザ通知が有効になりました', 'info');
      });
    }
  }
}
