/**
 * base-agent.js
 * 全エージェントの基底クラス
 * Firebase / LocalStorage の両方に対応した汎用CRUD操作を提供
 */

import { db, isConfigured } from '../firebase-config.js';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, limit, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

export class BaseAgent {
  /**
   * @param {string} agentId  - エージェントID (例: 'attendance')
   * @param {string} label    - 表示名 (例: '出席管理')
   * @param {string} icon     - アイコン絵文字
   * @param {string} collectionName - Firestoreコレクション名
   */
  constructor(agentId, label, icon, collectionName) {
    this.agentId        = agentId;
    this.label          = label;
    this.icon           = icon;
    this.collectionName = collectionName;
    this.container      = null; // レンダリング先DOM
  }

  /* ===== ライフサイクル (サブクラスでオーバーライド) ===== */

  /** エージェントのHTMLを返す */
  render() { return `<div class="empty-state"><div class="empty-icon">${this.icon}</div><p>${this.label}</p></div>`; }

  /** render()後に呼ばれるイベント設定 */
  async init() {}

  /** コマンド文字列を受け取り、処理できれば true を返す */
  handleCommand(/* command */) { return false; }

  /* ===== Firebase / LocalStorage 抽象CRUD ===== */

  /** コレクション全件取得 */
  async getAll(orderField = 'createdAt', desc = true) {
    if (isConfigured && db) {
      try {
        const q = query(
          collection(db, this.collectionName),
          orderBy(orderField, desc ? 'desc' : 'asc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.error(`[${this.agentId}] getAll error:`, e);
        return this._lsGetAll();
      }
    }
    return this._lsGetAll();
  }

  /** 条件付き取得 */
  async getWhere(field, op, value, orderField = 'createdAt') {
    if (isConfigured && db) {
      try {
        const q = query(
          collection(db, this.collectionName),
          where(field, op, value),
          orderBy(orderField, 'desc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn(`[${this.agentId}] getWhere fallback to LS:`, e.message);
        return this._lsGetAll().filter(r => {
          const val = r[field];
          if (op === '==')  return val === value;
          if (op === '>=')  return val >= value;
          if (op === '<=')  return val <= value;
          if (op === '!=')  return val !== value;
          return true;
        });
      }
    }
    return this._lsGetAll().filter(r => {
      const val = r[field];
      if (op === '==') return val === value;
      if (op === '>=') return val >= value;
      if (op === '<=') return val <= value;
      if (op === '!=') return val !== value;
      return true;
    });
  }

  /** IDで1件取得 */
  async getById(id) {
    if (isConfigured && db) {
      try {
        const snap = await getDoc(doc(db, this.collectionName, id));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      } catch (e) { /* fallthrough */ }
    }
    return this._lsGetAll().find(r => r.id === id) || null;
  }

  /** 追加（自動ID） */
  async add(data) {
    const record = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (isConfigured && db) {
      try {
        const ref = await addDoc(collection(db, this.collectionName), {
          ...record,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { id: ref.id, ...record };
      } catch (e) { console.warn(`[${this.agentId}] add fallback:`, e.message); }
    }
    return this._lsAdd(record);
  }

  /** 更新 */
  async update(id, data) {
    const patch = { ...data, updatedAt: new Date().toISOString() };
    if (isConfigured && db) {
      try {
        await updateDoc(doc(db, this.collectionName, id), { ...patch, updatedAt: serverTimestamp() });
        return { id, ...patch };
      } catch (e) { console.warn(`[${this.agentId}] update fallback:`, e.message); }
    }
    return this._lsUpdate(id, patch);
  }

  /** 削除 */
  async delete(id) {
    if (isConfigured && db) {
      try {
        await deleteDoc(doc(db, this.collectionName, id));
        return true;
      } catch (e) { console.warn(`[${this.agentId}] delete fallback:`, e.message); }
    }
    return this._lsDelete(id);
  }

  /* ===== LocalStorage フォールバック ===== */

  _lsKey() { return `juku_${this.collectionName}`; }

  _lsGetAll() {
    try {
      return JSON.parse(localStorage.getItem(this._lsKey()) || '[]');
    } catch { return []; }
  }

  _lsSave(arr) {
    localStorage.setItem(this._lsKey(), JSON.stringify(arr));
  }

  _lsAdd(data) {
    const arr = this._lsGetAll();
    const record = { id: `ls_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...data };
    arr.unshift(record);
    this._lsSave(arr);
    return record;
  }

  _lsUpdate(id, data) {
    const arr = this._lsGetAll();
    const idx = arr.findIndex(r => r.id === id);
    if (idx !== -1) { arr[idx] = { ...arr[idx], ...data }; this._lsSave(arr); return arr[idx]; }
    return null;
  }

  _lsDelete(id) {
    const arr = this._lsGetAll().filter(r => r.id !== id);
    this._lsSave(arr);
    return true;
  }

  /* ===== UI ヘルパー ===== */

  /** コンテンツエリアにレンダリング */
  mount(container) {
    this.container = container;
    container.innerHTML = this.render();
    this.init();
  }

  /** モーダルを開く */
  openModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  /** モーダルを閉じる */
  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  /** トースト通知 */
  toast(msg, type = 'success') {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => { t.classList.add('fadeout'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  /** 確認ダイアログ */
  confirm(msg) { return window.confirm(msg); }

  /** 日付フォーマット (YYYY-MM-DD → 〇月〇日) */
  formatDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return isNaN(d) ? str : `${d.getMonth()+1}月${d.getDate()}日`;
  }

  /** 時刻フォーマット */
  formatTime(str) {
    if (!str) return '';
    return str.slice(0, 5);
  }

  /** 今日の日付文字列 YYYY-MM-DD */
  today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** 今日の曜日インデックス (0=日, 1=月, ...) */
  todayDow() {
    return new Date().getDay();
  }

  /** 分を H時間M分 に変換 */
  minsToHM(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}時間${m}分` : `${m}分`;
  }
}
