// v2.1 存档备份（2026-11-21 Gray）：「玩家存档」页右上角「存档备份」→ 弹出网页对话框：
//   导出：把本机所有游戏数据（玩家存档 = 错题本 / 单词书 / 记忆进度 / 成就 / 积分，以及设置）打包成一个 .json 文件下载；
//   导入：选一个导出的 .json → 检查格式 → 显示里面有哪些玩家 → 确认后覆盖本机数据并重新载入。
// 不导出联网对战的临时数据（wf_net_*）和调试用的 wf_daily_offset。用网页原生按钮 / 文件框，安卓 Chrome 和电脑都能点。
(function () {
  const W = window.WF, G = W.Game && W.Game.prototype;
  const SKIP = k => /^wf_net_/.test(k) || k === 'wf_daily_offset';
  const MAX_BYTES = 4.5 * 1048576;
  const Save = W.Save = {
    open: false,
    keys() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('wf_') && !SKIP(k)) out.push(k); } } catch (e) {} return out.sort(); },
    snapshot(now) {
      const keys = {}; for (const k of this.keys()) keys[k] = localStorage.getItem(k);
      return { app: 'wordfight', kind: 'save', v: 1, exported: new Date(now || Date.now()).toISOString(), keys };
    },
    fileName(now) { const d = new Date(now || Date.now()), z = n => String(n).padStart(2, '0'); return `单词格斗存档_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.json`; },
    // 检查导入的文本：返回 { ok, err, data, summary }
    validate(text) {
      if (typeof text !== 'string' || !text.trim()) return { ok: false, err: '文件是空的' };
      if (text.length > MAX_BYTES) return { ok: false, err: '文件太大，不像是单词格斗的存档' };
      let o; try { o = JSON.parse(text); } catch (e) { return { ok: false, err: '不是有效的存档文件（JSON 格式不对）' }; }
      if (!o || o.app !== 'wordfight' || o.kind !== 'save' || !o.keys || typeof o.keys !== 'object' || Array.isArray(o.keys)) return { ok: false, err: '这不是单词格斗导出的存档' };
      if (!(o.v >= 1)) return { ok: false, err: '存档版本不认识' };
      const ks = Object.keys(o.keys);
      for (const k of ks) { if (!/^wf_[a-z0-9_]+$/i.test(k) || typeof o.keys[k] !== 'string') return { ok: false, err: '存档内容不对：' + k.slice(0, 30) }; }
      let profiles = [];
      if (o.keys.wf_profiles_v1 != null) {
        let pd; try { pd = JSON.parse(o.keys.wf_profiles_v1); } catch (e) { return { ok: false, err: '玩家存档损坏，无法读取' }; }
        if (!pd || !Array.isArray(pd.profiles) || pd.profiles.some(p => !p || typeof p.id !== 'string' || typeof p.name !== 'string')) return { ok: false, err: '玩家存档格式不对' };
        profiles = pd.profiles.map(p => ({ name: p.name, words: p.history ? Object.keys(p.history).length : 0 }));
      }
      if (!ks.length) return { ok: false, err: '存档里没有数据' };
      return { ok: true, data: o, summary: { exported: o.exported || '', profiles, keys: ks.length } };
    },
    // 覆盖本机数据（只动 wf_ 开头、非联网的键）
    apply(data) {
      const old = this.keys();
      const backup = {}; for (const k of old) backup[k] = localStorage.getItem(k);
      try {
        for (const k of old) localStorage.removeItem(k);
        for (const k of Object.keys(data.keys)) if (!SKIP(k)) localStorage.setItem(k, data.keys[k]);
        return true;
      } catch (e) {
        try { for (const k of this.keys()) localStorage.removeItem(k); for (const k in backup) localStorage.setItem(k, backup[k]); } catch (x) {}
        return false;
      }
    },
    exportFile() {
      const text = JSON.stringify(this.snapshot()), name = this.fileName();
      const blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
      return { name, bytes: text.length };
    },
  };

  // ---------- 网页对话框 ----------
  let box = null;
  function el() {
    if (box) return box;
    const st = document.createElement('style');
    st.textContent = `
#wf-save{position:fixed;inset:0;z-index:96;display:none;align-items:center;justify-content:center;background:rgba(5,3,12,.78);font-family:"Noto Sans SC","Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif;color:#fff4dc;}
#wf-save .p{width:min(92vw,560px);max-height:92vh;overflow:auto;background:#1b1230;border:4px solid #ffd23c;box-shadow:0 0 0 4px #05030c,0 0 0 8px #7a5a10;padding:18px 22px;box-sizing:border-box;}
#wf-save h3{margin:0 0 8px;color:#ffd23c;font-size:22px;letter-spacing:.1em;}
#wf-save p{margin:6px 0;font-size:14px;line-height:1.5;color:#e9dff5;}
#wf-save .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;}
#wf-save button,#wf-save label.b{font:inherit;font-size:16px;font-weight:700;color:#fff;background:#3a2266;border:3px solid #ffd23c;padding:10px 16px;min-height:44px;cursor:pointer;display:inline-flex;align-items:center;}
#wf-save button.warn{background:#7a1414;border-color:#ff8a8a;}
#wf-save button.ghost{background:transparent;border-color:#6a5a90;color:#bfb3d6;}
#wf-save input[type=file]{position:absolute;width:1px;height:1px;opacity:0;}
#wf-save .msg{min-height:22px;font-size:14px;margin-top:10px;color:#7dff9a;white-space:pre-line;}
#wf-save .msg.err{color:#ff8a8a;}
#wf-save ul{margin:6px 0 0 18px;padding:0;font-size:14px;color:#fff;}`;
    document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'wf-save';
    box.innerHTML = `<div class="p" role="dialog" aria-label="存档备份">
<h3>存档备份</h3>
<p>导出：把这台设备上的全部玩家存档（错题本、单词书、记忆进度、成就、积分）和设置存成一个文件，换手机 / 清缓存前先导出。</p>
<p>导入：选之前导出的文件，<b>会覆盖</b>这台设备上现在的全部存档。</p>
<div class="row main"><button data-act="export">导出存档</button><label class="b">导入存档<input type="file" accept=".json,application/json,text/plain"></label><button class="ghost" data-act="close">关闭</button></div>
<div class="confirm" style="display:none"><p class="sum"></p><ul></ul><div class="row"><button class="warn" data-act="apply">覆盖导入</button><button class="ghost" data-act="cancel">取消</button></div></div>
<div class="msg"></div></div>`;
    document.body.appendChild(box);
    const msg = box.querySelector('.msg'), conf = box.querySelector('.confirm'), main = box.querySelector('.row.main'), file = box.querySelector('input[type=file]');
    const say = (t, err) => { msg.textContent = t || ''; msg.className = 'msg' + (err ? ' err' : ''); };
    let pending = null;
    box.addEventListener('click', e => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (e.target === box) act || Save.close();
      if (act === 'close') Save.close();
      if (act === 'export') {
        try { const r = Save.exportFile(); say(`已导出「${r.name}」（${Math.max(1, Math.round(r.bytes / 1024))} KB）\n在手机的「下载」或「文件」里能找到`); }
        catch (x) { say('导出失败：' + (x && x.message || x), true); }
      }
      if (act === 'cancel') { pending = null; conf.style.display = 'none'; main.style.display = ''; say('已取消，本机存档没有改动'); }
      if (act === 'apply' && pending) {
        if (Save.apply(pending.data)) { say('导入成功，正在重新载入…'); setTimeout(() => location.reload(), 600); }
        else { say('导入失败：手机存储空间不够或浏览器不让写入，本机存档已还原', true); }
        pending = null; conf.style.display = 'none'; main.style.display = '';
      }
    });
    file.addEventListener('change', () => {
      const f = file.files && file.files[0]; file.value = '';
      if (!f) return;
      if (f.size > MAX_BYTES) { say('文件太大，不像是单词格斗的存档', true); return; }
      const rd = new FileReader();
      rd.onerror = () => say('读不了这个文件', true);
      rd.onload = () => {
        const r = Save.validate(String(rd.result || ''));
        if (!r.ok) { say(r.err, true); return; }
        pending = r; say('');
        const s = r.summary, when = s.exported ? new Date(s.exported) : null;
        conf.querySelector('.sum').textContent = `存档导出于 ${when && !isNaN(when) ? when.toLocaleString('zh-CN') : '未知时间'}，含 ${s.profiles.length} 个玩家。确认后会覆盖本机现在的 ${W.Profiles.list().length} 个玩家：`;
        conf.querySelector('ul').innerHTML = '';
        for (const p of s.profiles) { const li = document.createElement('li'); li.textContent = `${p.name}（记录 ${p.words} 个词）`; conf.querySelector('ul').appendChild(li); }
        conf.style.display = ''; main.style.display = 'none';
      };
      rd.readAsText(f);
    });
    box.addEventListener('keydown', e => { if (e.key === 'Escape') Save.close(); e.stopPropagation(); });
    return box;
  }
  Save.show = function () { const b = el(); b.style.display = 'flex'; this.open = true; b.querySelector('.msg').textContent = ''; const f = b.querySelector('button[data-act=export]'); if (f && !W.touch) f.focus(); };
  Save.close = function () { if (!box) return; box.style.display = 'none'; this.open = false; const c = box.querySelector('.confirm'); c.style.display = 'none'; box.querySelector('.row.main').style.display = ''; };

  if (!G) return;
  // 玩家存档页右上角按钮（点击由 main.js 的 key: 'saveBox' 处理；键盘按 B）
  const baseDraw = G.drawProfiles;
  G.drawProfiles = function () {
    baseDraw.apply(this, arguments);
    if (this.ui.sub === 'create' || this.ui.sub === 'rename' || this.ui.confirm) return;
    const r = { x: 812, y: 14, w: 134, h: 36, key: 'saveBox', i: -1, en: true };
    this.box(r.x, r.y, r.w, r.h, 'rgba(20,14,40,0.9)', '#7dff9a', 2);
    this.txt('存档备份', r.x + r.w / 2, r.y + r.h / 2 + 1, 16, '#7dff9a', 'center', { sw: 4, weight: 700 });
    this.menuRects.push(r);
  };
})();
