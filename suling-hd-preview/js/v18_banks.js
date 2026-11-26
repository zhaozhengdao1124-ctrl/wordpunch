// v1.8 按需词库：原来的词库（junior…pep6）在默认包 data/banks.js 里；新导入的词库（考研/雅思/托福/SAT/新概念1~4）
// 各自一个 data/bank_<id>.js，选到才用 <script> 标签加载（file:// 和 http/PWA 都能用，不依赖 fetch）。
// 2026-11-21 首屏提速：所有词库（包括原默认词库）都改成按需加载。启动只读 data/banks_index.js（几 KB 清单），
//   选中的词库在进菜单后后台下载，开局前没下完就显示「正在下载词库」。拆分文件由 tools/split_banks.js 生成（data/b/<id>.js）。
// 约定：window.WF_BANKS 里 lazy 词库先是「空壳」（words:[]，count=词数，file=文件，bytes=大小）；加载后把词填进同一个 words 数组并置 loaded=true。
(function () {
  const W = window.WF = window.WF || {};
  const TIMEOUT = 30000;          // 单次下载超时（慢网络给足时间）
  const st = {};                  // id → 'loading' | 'error'
  const pend = {};                // id → Promise（同一个词库同时只下载一次）

  function find(x) { return typeof x === 'string' ? (window.WF_BANKS || []).find(b => b.id === x) : x; }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      let done = false, timer;
      const fin = (ok, err) => { if (done) return; done = true; clearTimeout(timer); s.onload = s.onerror = null; if (s.parentNode) s.parentNode.removeChild(s); ok ? res() : rej(err); };
      s.onload = () => fin(true); s.onerror = () => fin(false, new Error('network'));
      timer = setTimeout(() => fin(false, new Error('timeout')), TIMEOUT);
      s.async = true; s.src = src; document.head.appendChild(s);
    });
  }
  function expand(b) {
    const L = (window.WF_LAZY || {})[b.id];
    if (!L || !Array.isArray(L.order) || !L.own) throw new Error('bad-file');   // 文件被截断 / 内容不对
    const dic = window.WF_DICT, out = [];
    for (const w of L.order) {
      const e = dic[w] || L.own[w];
      if (!e) throw new Error('bad-file');
      if (!dic[w]) dic[w] = e;
      out.push(e);
    }
    if (b.count && out.length !== b.count) throw new Error('bad-file');
    b.words.length = 0;
    for (let i = 0; i < out.length; i++) b.words.push(out[i]);   // 保持同一个数组对象，别处拿着引用也能看到
    b.loaded = true; delete window.WF_LAZY[b.id];
  }
  const Banks = W.Banks = {
    find,
    state(x) { const b = find(x); return !b ? 'none' : (!b.lazy || b.loaded) ? 'loaded' : (st[b.id] || 'idle'); },
    isLoaded(x) { const b = find(x); return !!b && (!b.lazy || !!b.loaded); },
    sizeText(x) { const b = find(x); const kb = b && b.bytes ? b.bytes / 1048576 : 0; return kb >= 0.95 ? kb.toFixed(1) + ' MB' : Math.max(1, Math.round((b && b.bytes || 0) / 1024)) + ' KB'; },
    reset(x) { const b = find(x); if (b && st[b.id] === 'error') delete st[b.id]; },
    // 返回 Promise；失败时 reject（Error.message = network | timeout | bad-file）。失败会自动再试一次（换个 URL 绕开坏缓存）。
    ensure(x) {
      const b = find(x);
      if (!b) return Promise.reject(new Error('no-bank'));
      if (!b.lazy || b.loaded) return Promise.resolve(b);
      if (pend[b.id]) return pend[b.id];
      st[b.id] = 'loading';
      const attempt = (n) => loadScript(b.file + (n ? '?r=' + Date.now() : '')).then(() => expand(b))
        .catch(err => { if (n < 1) return new Promise(r => setTimeout(r, 700)).then(() => attempt(n + 1)); throw err; });
      pend[b.id] = attempt(0).then(() => { delete st[b.id]; delete pend[b.id]; return b; },
        err => { st[b.id] = 'error'; delete pend[b.id]; throw err; });
      return pend[b.id];
    },
  };

  const G = W.Game && W.Game.prototype;
  if (!G) return;
  const errText = e => (e && e.message === 'bad-file') ? '词库文件不完整' : (e && e.message === 'timeout') ? '网络太慢，超时了' : '网络连不上（离线？）';

  // 当前能安全玩的词库下标：优先上一个用过的，否则第一个默认词库
  G.safeBank = function () {
    const ok = i => this.banks[i] && Banks.isLoaded(this.banks[i]);
    if (this.lastGoodBank != null && ok(this.lastGoodBank)) return this.lastGoodBank;
    let i = this.banks.findIndex(b => Banks.isLoaded(b)); if (i >= 0) return i;   // 已下载好的词库优先
    i = this.banks.findIndex(b => b.id === 'cet4'); if (i >= 0) return i;          // 都没下载：默认四级
    i = this.banks.findIndex(b => !b.lazy || b.core); return i < 0 ? 0 : i;
  };
  // 开局用的词库：选的词库没下载好（比如错题对战不需要它）就用安全词库兜底，保证 bank.words 不是空的
  G.bankForPlay = function () {
    const b = this.banks[this.menu.bank];
    return (b && Banks.isLoaded(b)) ? b : (this.banks[this.safeBank()] || this.banks[0]);
  };
  G.wrongBanks = function (entries) {
    const seen = new Set(), out = [];
    for (const e of entries || []) { if (!e || e.kind === 'math' || e.bank === 'math' || seen.has(e.bank)) continue; seen.add(e.bank); const b = find(e.bank); if (b && b.lazy && !b.loaded) out.push(b); }
    return out;
  };
  // 需要的词库里有没下载的 → 显示「下载中」，成功后继续 then()；失败 → 提示 + 回退到上一个词库。返回 true 表示已接管（调用方 return）。
  G.bankGate = function (list, then) {
    // 词库全是按需下载：开局兜底用的词库（bankForPlay）也必须是下载好的，所以总把当前选中的词库一起带上
    list = (list || []).concat([this.banks[this.menu.bank]]);
    const need = [...new Set((list || []).filter(Boolean))].filter(b => b.lazy && !b.loaded);
    // 2026-11-21：角色图也是按需下载的。闯关开局前等全部角色（小怪 / 首领）的正常图；其它模式等对战双方的正常图。
    //   受击白 / 红图没下完时先用正常图顶替（render.js Sprites.draw），不用等。
    let ids = null;
    if (!this._campGate) { if (this.applyChars) this.applyChars(); ids = (this.chars || []).slice(); }   // 对战双方
    const S = W.Sprites, sp = S && S.missing ? S.missing(ids, ['']) : [];
    if (!need.length && !sp.length) return false;
    if (this.bankLoad) return true;
    const tok = this.bankLoad = { names: need.map(b => b.name), bytes: need.reduce((s, b) => s + (b.bytes || 0), 0), t0: performance.now(), err: null, cancelled: false, banks: need, sp };
    this.say(need.length ? '词库按需下载' : '角色素材加载', need.map(b => b.id).join(','), sp.length ? '图 ' + sp.length : '');
    Promise.all(need.map(b => Banks.ensure(b)).concat(sp.length ? [S.need(sp)] : [])).then(() => {
      if (tok.cancelled || this.bankLoad !== tok) return;
      this.bankLoad = null;
      if (this.banks[this.menu.bank] && Banks.isLoaded(this.banks[this.menu.bank])) this.lastGoodBank = this.menu.bank;
      then(); this.render();
    }, err => {
      if (tok.cancelled || this.bankLoad !== tok) return;
      const cur = this.banks[this.menu.bank], bad = need.includes(cur);
      if (bad) { this.menu.bank = this.safeBank(); this.persistMenu(); }
      tok.err = errText(err); tok.fallback = bad ? this.banks[this.menu.bank].name : null; tok.tErr = performance.now();
      this.say('词库下载失败', need.map(b => b.id).join(','), String(err && err.message));
      this.render();
      setTimeout(() => { if (this.bankLoad === tok) { this.bankLoad = null; this.render(); } }, 3500);
    });
    this.render();
    return true;
  };
  G.bankLoadInput = function () {
    const t = this.bankLoad; if (!t) return;
    if (t.err) { if (performance.now() - t.tErr > 500) this.bankLoad = null; return; }
    t.cancelled = true; this.bankLoad = null;   // 取消：词库仍在后台继续下，下次选就是现成的
  };
  // 后台下载（图鉴/错题本/启动预载）：不挡操作，下完刷新单词书
  G.bankBg = function (list) {
    for (const b of list || []) {
      if (!b || !b.lazy || b.loaded || Banks.state(b) !== 'idle') continue;
      Banks.ensure(b).then(() => { if (window.WF.BookUI && this.state === 'title' && /^(book|wrongbook)$/.test(this.ui.screen)) WF.BookUI.refresh(this, true); this.render(); },
        () => { if (window.WF.BookUI && this.state === 'title' && /^(book|wrongbook)$/.test(this.ui.screen)) WF.BookUI.refresh(this, true); });
    }
  };
  G.bankRetry = function (i) { const b = this.banks[i]; if (b && b.lazy && Banks.state(b) === 'error') Banks.reset(b); };
  G.bankBoot = function () {
    const i = this.banks.findIndex(b => b.id === (function () { try { return localStorage.getItem('wf_bank'); } catch (e) { return null; } })());
    const b = this.banks[i >= 0 ? i : this.menu.bank];
    if (b && b.lazy && !b.loaded) { this.lastGoodBank = this.safeBank(); this.bankBg([b]); }
    else this.lastGoodBank = this.menu.bank;
  };
  // 设置里切词库：选中已下载的就记为「上一个词库」
  const menuAct = G.menuAct;
  G.menuAct = function (key, d) {
    const r = menuAct.apply(this, arguments);
    if (key === 'bank' && this.banks[this.menu.bank] && Banks.isLoaded(this.banks[this.menu.bank])) this.lastGoodBank = this.menu.bank;
    return r;
  };

  // 下载中 / 失败 提示（画在最上层）
  const render = G.render;
  G.render = function () {
    render.apply(this, arguments);
    const t = this.bankLoad; if (!t) return;
    const ctx = this.ctx, C = WF.CFG, w = C.SCREEN_W, h = C.SCREEN_H, cx = w / 2, cy = h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,12,0.78)'; ctx.fillRect(0, 0, w, h);
    const pw = 520, ph = 168, x = cx - pw / 2, y = cy - ph / 2;
    ctx.fillStyle = '#1b1230'; ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = t.err ? '#ff6b6b' : '#ffd23c'; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, pw - 4, ph - 4);
    ctx.restore();
    const nm = t.names.length > 2 ? t.names.slice(0, 2).join('、') + ' 等 ' + t.names.length + ' 个' : t.names.join('、');
    if (t.err) {
      this.txt(`「${nm}」下载失败`, cx, y + 44, 28, '#ff8a8a', 'center', { sw: 5, weight: 700 });
      this.txt(t.err + (t.fallback ? '，已换回「' + t.fallback + '」' : ''), cx, y + 88, 20, '#fff4d6', 'center', { sw: 4, weight: 700 });
      this.txt('联网后再选一次就行', cx, y + 124, 16, '#bfb3d6', 'center', { sw: 3 });
    } else if (!t.names.length) {
      // 只差角色图：像素进度条
      const left = W.Sprites.missing ? t.sp.filter(([id, v]) => !W.Sprites.settled(id, v)).length : 0, done = t.sp.length - left, k = t.sp.length ? done / t.sp.length : 1;
      this.txt('正在加载角色素材' + '.'.repeat(1 + Math.floor(performance.now() / 350) % 3), cx, y + 44, 28, '#ffd23c', 'center', { sw: 5, weight: 700 });
      const bw = 400, bx = cx - bw / 2, by = y + 78, seg = Math.round(k * 20);
      ctx.save(); ctx.fillStyle = '#05030c'; ctx.fillRect(bx - 4, by - 4, bw + 8, 26); ctx.fillStyle = '#ffd23c';
      for (let i = 0; i < seg; i++) ctx.fillRect(bx + i * 20, by, 17, 18);
      ctx.restore();
      this.txt(`${done} / ${t.sp.length}`, cx, y + 124, 16, '#bfb3d6', 'center', { sw: 3 });
    } else {
      const n = 1 + Math.floor(performance.now() / 350) % 3;
      this.txt(`正在下载词库「${nm}」${'.'.repeat(n)}`, cx, y + 44, 28, '#ffd23c', 'center', { sw: 5, weight: 700 });
      const mb = t.bytes / 1048576;
      this.txt(`首次需要下载约 ${mb >= 0.95 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(t.bytes / 1024)) + ' KB'}，之后会存在本机`, cx, y + 88, 18, '#fff4d6', 'center', { sw: 4, weight: 700 });
      this.txt('按任意键 / 点一下可以取消', cx, y + 124, 16, '#bfb3d6', 'center', { sw: 3 });
    }
  };
  // 下载中要持续刷新动画点点（正常游戏循环本来就在刷新；这里兜住手动步进之外的情况）
})();
