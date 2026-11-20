// 单词书 / 错题本（v1.8.1 改版，参考百词斩单词列表）：清晰的 HTML 图层，不走像素画布。
// 一行一个词：左边单词（单击 = 读音，双击 = 详细页），右边释义被灰条遮住（点灰条显示 / 再点遮住）。
// 详细页（音标、释义、常用搭配、例句）整屏打开，双击任意处或点「返回」退回列表，列表滚动位置不变。
// 列表虚拟滚动（只画屏幕上看得到的几十行），托福 1 万多词也顺滑。
(function () {
  const W = window.WF = window.WF || {};
  const FONT = "'Segoe UI','Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif";
  const FONT_IPA = "'Segoe UI','Charis SIL','Doulos SIL','Noto Sans','Arial Unicode MS','Lucida Sans Unicode',sans-serif";
  const TAGS = {
    new: { name: '未学', color: '#8a90a8' },
    seen: { name: '学过', color: '#e8e0f4' },
    mastered: { name: '已掌握', color: '#7dff9a' },
    wrong: { name: '错题', color: '#ff6a6a' },
  };
  const STATUS = [
    { id: 'all', name: '全部' }, { id: 'new', name: '未学' }, { id: 'seen', name: '学过' },
    { id: 'mastered', name: '已掌握' }, { id: 'wrong', name: '错题' },
  ];
  const DBL_MS = 330;          // 双击判定间隔
  const OVERSCAN = 8;          // 虚拟列表上下多画几行
  const isTouch = () => !!(W.touch || (document.body && document.body.classList.contains('wf-touch')));
  const rowH = () => 40;

  const css = `
#wf-dict[hidden]{display:none !important;}
#wf-dict{position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;background:#100a18;color:#f4eefc;font-family:${FONT};
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;image-rendering:auto;touch-action:pan-y;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);}
#wf-dict *{box-sizing:border-box;image-rendering:auto;}
#wf-dict button{appearance:none;-webkit-appearance:none;font-family:${FONT};cursor:pointer;touch-action:manipulation;}
#wf-dict .wf-bar{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;padding:8px 14px 6px;border-bottom:2px solid #3a2f55;background:linear-gradient(180deg,#1a1230,#140c22);}
#wf-dict .wf-row1{display:flex;align-items:center;gap:8px;min-width:0;}
#wf-dict .wf-btn{flex:0 0 auto;min-height:44px;min-width:44px;padding:0 12px;border:1px solid #5d4f86;background:#1b1430;color:#e9d7a6;font-weight:700;font-size:14px;border-radius:8px;white-space:nowrap;}
#wf-dict .wf-btn:hover,#wf-dict .wf-tab:hover{border-color:#ffd23c;color:#ffd23c;}
#wf-dict .wf-btn.hot{border-color:#ffd23c;background:#ffd23c22;color:#ffd23c;}
#wf-dict h1{margin:0;flex:0 1 auto;min-width:0;font:700 18px ${FONT};color:#ffd23c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 8px #ffd23c55;}
#wf-dict .wf-search{flex:1 1 140px;min-width:90px;height:36px;padding:0 12px;border:1px solid #8f86b8;border-radius:8px;background:#0c0814;color:#fff;font:15px/1.2 ${FONT};outline:none;-webkit-user-select:text;user-select:text;}
#wf-dict .wf-search::placeholder{color:#8f86b8;}
#wf-dict .wf-search:focus{border-color:#ffd23c;box-shadow:0 0 0 2px #ffd23c33;}
#wf-dict .wf-spacer{flex:1 1 0;}
#wf-dict .wf-count{flex:0 0 auto;color:#bfb3d6;font-size:13px;white-space:nowrap;}
#wf-dict .wf-count b{color:#7df9ff;font-weight:700;}
#wf-dict .wf-row2{display:flex;align-items:center;gap:6px;min-width:0;}
#wf-dict .wf-status{flex:0 0 auto;display:flex;gap:4px;padding-right:6px;border-right:1px solid #3a2f55;}
#wf-dict .wf-tabs{flex:1 1 auto;min-width:0;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x;-webkit-overflow-scrolling:touch;}
#wf-dict .wf-tabs::-webkit-scrollbar{display:none;}
#wf-dict .wf-tab{flex:0 0 auto;min-height:44px;padding:0 12px;border:1px solid #4a3d72;background:#1b1430;color:#e8e0f4;font-weight:600;font-size:14px;border-radius:999px;white-space:nowrap;}
#wf-dict .wf-tab.on{background:#ffd23c22;border-color:#ffd23c;color:#ffd23c;}
#wf-dict .wf-st{border-radius:6px;padding:0 9px;}
#wf-dict .wf-st.on{background:#7df9ff1c;border-color:#7df9ff;color:#7df9ff;}
#wf-dict .wf-st small{font-size:11px;opacity:.75;margin-left:3px;}
#wf-dict .wf-list{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;position:relative;touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
#wf-dict .wf-inner{position:relative;width:100%;}
#wf-dict .wf-empty{margin:40px 20px;text-align:center;color:#bfb3d6;font-size:16px;line-height:1.6;}
#wf-dict .wf-row{position:absolute;left:0;right:0;display:flex;align-items:stretch;border-bottom:1px solid #241b3a;padding:0 14px;touch-action:manipulation;}
#wf-dict .wf-row.on{background:#241a3a;box-shadow:inset 3px 0 0 #ffd23c;}
#wf-dict .wf-w{flex:0 0 38%;max-width:300px;min-width:0;display:flex;align-items:center;gap:6px;padding-right:10px;cursor:pointer;}
#wf-dict .wf-w b{font-size:17px;font-weight:700;color:#ffd23c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#wf-dict .wf-row.say .wf-w b{color:#7df9ff;text-shadow:0 0 8px #7df9ff88;}
#wf-dict .wf-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;}
#wf-dict .wf-m{flex:1 1 auto;min-width:0;display:flex;align-items:center;cursor:pointer;}
#wf-dict .wf-m span{display:block;width:100%;height:28px;line-height:28px;padding:0 10px;border-radius:14px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#wf-dict .wf-m.mask span{background:#3a3150;color:transparent;}#wf-dict .wf-m.mask span *{visibility:hidden;}
#wf-dict .wf-m.mask span:hover{background:#463c60;}
#wf-dict .wf-m.open span{background:#1b1430;color:#f4eefc;}
#wf-dict .wf-m i{font-style:normal;color:#8fd0ff;margin-right:4px;}
#wf-dict .wf-bad{flex:0 0 auto;align-self:center;margin-left:8px;color:#ff6a6a;font-size:12px;font-weight:700;white-space:nowrap;}
#wf-dict .wf-foot{flex:0 0 auto;padding:5px 14px calc(5px + env(safe-area-inset-bottom));color:#8f86b8;font-size:12px;text-align:center;border-top:1px solid #3a2f55;background:#140c22;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#wf-dict .wf-detail{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;background:#100a18;touch-action:pan-y;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);}
#wf-dict .wf-detail[hidden]{display:none;}
#wf-dict .wf-dhead{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:2px solid #3a2f55;background:linear-gradient(180deg,#1a1230,#140c22);min-width:0;}
#wf-dict .wf-dword{font-size:26px;font-weight:800;color:#ffd23c;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;text-shadow:0 0 10px #ffd23c55;}
#wf-dict .wf-dipa{font:16px/1.3 ${FONT_IPA};color:#c8bddc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto;}
#wf-dict .wf-dtag{flex:0 0 auto;font-size:13px;font-weight:700;}
#wf-dict .wf-dhint{flex:0 0 auto;margin-left:auto;color:#8f86b8;font-size:12px;white-space:nowrap;}
#wf-dict .wf-dbody{flex:1 1 auto;min-height:0;overflow-y:auto;padding:8px 18px 14px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
#wf-dict .wf-sense{padding:8px 0;}
#wf-dict .wf-sense+.wf-sense{border-top:1px dashed #3a2f55;}
#wf-dict .wf-meaning{font:16px/1.5 ${FONT};color:#fff;}
#wf-dict .wf-pos{display:inline-block;min-width:34px;margin-right:8px;padding:0 6px;border-radius:5px;background:#2a2044;color:#8fd0ff;font:700 13px/20px ${FONT};text-align:center;vertical-align:1px;}
#wf-dict .wf-miss{margin-left:8px;color:#ff6a6a;font:700 12px ${FONT};}
#wf-dict .wf-lbl{margin:6px 0 2px;color:#8f86b8;font-size:12px;font-weight:700;letter-spacing:.05em;}
#wf-dict .wf-phr{display:flex;flex-wrap:wrap;gap:4px 6px;}
#wf-dict .wf-phr span{display:inline-block;padding:1px 9px;border-radius:11px;background:#231a3c;border:1px solid #4a3d72;font:14px/1.5 ${FONT};color:#ffe9a0;}
#wf-dict .wf-phr span i{font-style:normal;color:#bfb3d6;margin-left:5px;}
#wf-dict .wf-ex{font:15px/1.45 ${FONT};color:#e9d7a6;overflow-wrap:anywhere;}
#wf-dict .wf-exzh{font:14px/1.45 ${FONT};color:#bfb3d6;overflow-wrap:anywhere;margin-bottom:3px;}
@media (min-height:600px){#wf-dict .wf-bar{padding:12px 20px 8px;gap:8px;}#wf-dict .wf-row{padding:0 20px;}#wf-dict h1{font-size:20px;}#wf-dict .wf-w b{font-size:18px;}#wf-dict .wf-dbody{padding:10px 24px 16px;}#wf-dict .wf-meaning{font-size:18px;}#wf-dict .wf-ex{font-size:17px;}#wf-dict .wf-exzh{font-size:16px;}#wf-dict .wf-phr span{font-size:15px;}#wf-dict .wf-lbl{font-size:13px;}#wf-dict .wf-dword{font-size:30px;}#wf-dict .wf-dipa{font-size:18px;}#wf-dict .wf-foot{font-size:13px;}#wf-dict .wf-dhead{padding:10px 20px;}}
@media (max-width:720px){#wf-dict h1{display:none;}#wf-dict .wf-st{padding:0 7px;font-size:13px;}#wf-dict .wf-st small{display:none;}}
`;

  let root = null, mode = '', dataSig = '', list = [], rawN = 0, states = null, P = null;
  let els = {}, showAll = false, flipped = new Set(), lastTap = { i: -1, t: 0, zone: '' }, saidI = -1, saidT = 0, detailI = -1, lastDetailTap = 0;
  try { showAll = localStorage.getItem('wf_book_show') === '1'; } catch (e) {}

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function ensure() {
    if (root) return root;
    if (!document.getElementById('wf-dict-style')) {
      const style = document.createElement('style'); style.id = 'wf-dict-style'; style.textContent = css; document.head.appendChild(style);
    }
    root = document.getElementById('wf-dict');
    if (!root) { root = el('div'); root.id = 'wf-dict'; document.body.appendChild(root); }
    root.hidden = true;
    return root;
  }
  const isMath = (w) => !w || w.kind === 'math' || w.bank === 'math';
  function partsOf(g, w) { return (g.exampleParts && g.exampleParts(w)) || { en: (w && w.ex) || '', zh: (w && w.exZh) || '' }; }
  function bankIdOf(g, w) { return mode === 'wrong' ? (w.bank || '') : ((g.banks[g.ui.bank] || {}).id); }
  function masteryOf(g, w) { return P ? WF.Profiles.mastery(P.id, bankIdOf(g, w), w.word) : 'new'; }
  // 一行用的短释义：前 2 个义项「词性 + 中文」
  function shortMeaning(w) {
    if (w.kind === 'phrase') return [{ pos: '', zh: w.meaning || '' }];
    const ss = WF.Quiz.senses(w).filter(s => s && (s.zh || s.pos)).slice(0, 2);
    return ss.map(s => ({ pos: s.pos || '', zh: String(s.zh || '').replace(/\s+/g, ' ') }));
  }
  function rawList(g) {
    if (mode === 'wrong') {
      const raw = P ? WF.Profiles.wrongList(P.id, g.ui.bankFilter || 'all') : [];
      return raw.map(h => g.enrichEntry(h));
    }
    return g.bookWords() || [];
  }
  // 状态筛选（只用存档里真实有的数据：mastery = 未学 / 学过 / 已掌握 / 错题）
  function computeList(g) {
    const all = rawList(g);
    states = null; rawN = all.length;
    if (mode === 'wrong') return all;
    const counts = { all: all.length, new: 0, seen: 0, mastered: 0, wrong: 0 };
    const ms = new Array(all.length);
    for (let i = 0; i < all.length; i++) { const m = masteryOf(g, all[i]); ms[i] = m; counts[m] = (counts[m] || 0) + 1; }
    states = counts;
    const st = g.ui.status || 'all';
    if (st === 'all') return all;
    return all.filter((w, i) => ms[i] === st);
  }
  function sigOf(g) {
    return [mode, g.menu.p1, g.ui.bank, g.ui.query || '', g.ui.bankFilter || '', g.ui.status || 'all'].join('|');
  }

  // ---------- 外壳（每次打开建一次；之后只更新内容，搜索框不会丢焦点） ----------
  function build(g) {
    const box = ensure();
    box.innerHTML = ''; els = {};
    P = WF.Profiles.get(g.menu.p1);
    const isWrong = mode === 'wrong';
    const bar = el('div', 'wf-bar'), r1 = el('div', 'wf-row1');
    r1.appendChild(btn('wf-btn wf-back', '返回', () => { if (WF.Speech) WF.Speech.stop(); g.goTitle(); g.render(); }));
    r1.appendChild(el('h1', '', (P ? P.name + ' 的' : '') + (isWrong ? '错题本' : '单词书')));
    if (isWrong) {
      r1.appendChild(el('div', 'wf-spacer'));
    } else {
      const search = el('input', 'wf-search');
      search.type = 'search'; search.placeholder = '搜索单词 / 释义'; search.value = g.ui.query || '';
      search.autocomplete = 'off'; search.spellcheck = false; search.setAttribute('enterkeyhint', 'search');
      search.addEventListener('input', () => { g.ui.query = search.value; g.ui.sel = 0; update(g, true); });
      r1.appendChild(search); els.search = search;
    }
    els.count = el('div', 'wf-count'); r1.appendChild(els.count);
    els.maskBtn = btn('wf-btn wf-maskall', '', () => { setShowAll(!showAll); });
    r1.appendChild(els.maskBtn);
    if (isWrong) r1.appendChild(btn('wf-btn hot wf-fight', '错题对战', () => g.requestStart(true)));
    bar.appendChild(r1);
    const r2 = el('div', 'wf-row2');
    if (!isWrong) { els.status = el('div', 'wf-status'); r2.appendChild(els.status); }
    els.tabs = el('div', 'wf-tabs'); r2.appendChild(els.tabs);
    bar.appendChild(r2);
    box.appendChild(bar);
    buildTabs(g);
    const sc = el('div', 'wf-list'), inner = el('div', 'wf-inner');
    sc.appendChild(inner); box.appendChild(sc);
    els.list = sc; els.inner = inner;
    let raf = 0, pfT = null;
    sc.addEventListener('scroll', () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(g); });
      if (!pfT) pfT = setTimeout(() => { pfT = null; prefetchVisible(); }, 150);
    }, { passive: true });
    sc.addEventListener('click', (e) => onRowClick(g, e));
    els.foot = el('div', 'wf-foot'); box.appendChild(els.foot);
    const d = el('div', 'wf-detail'); d.hidden = true; box.appendChild(d); els.detail = d;
    d.addEventListener('click', (e) => onDetailClick(g, e));
    if (!els._resize) { els._resize = () => { if (root && !root.hidden) paint(g, true); }; }
    window.addEventListener('resize', els._resize);
    update(g, true);
  }
  function buildTabs(g) {
    const isWrong = mode === 'wrong';
    els.tabs.innerHTML = '';
    const items = isWrong
      ? [{ id: 'all', name: '全部' }, { id: 'phrases', name: '短语' }].concat((g.banks || []).map(b => ({ id: b.id, name: b.name })))
      : (g.banks || []).map((b, i) => ({ id: i, name: b.name }));
    items.forEach((t) => {
      const on = isWrong ? (g.ui.bankFilter || 'all') === t.id : (g.ui.bank === t.id);
      const b = btn('wf-tab' + (on ? ' on' : ''), t.name, () => {
        if (WF.Speech) WF.Speech.stop();
        if (isWrong) g.ui.bankFilter = t.id; else { g.ui.bank = t.id; if (g.bankRetry) g.bankRetry(t.id); }
        g.ui.sel = 0; update(g, true);
      });
      if (on) b.dataset.on = '1';
      els.tabs.appendChild(b);
    });
    const on = els.tabs.querySelector('.wf-tab.on');
    if (on) requestAnimationFrame(() => { const r = els.tabs; if (!r.isConnected) return; const l = on.offsetLeft - r.offsetLeft; if (l < r.scrollLeft || l + on.offsetWidth > r.scrollLeft + r.clientWidth) r.scrollLeft = Math.max(0, l - 40); });
  }
  function buildStatus(g) {
    if (!els.status) return;
    els.status.innerHTML = '';
    const cur = g.ui.status || 'all';
    STATUS.forEach(s => {
      if (s.id !== 'all' && s.id !== cur && states && !states[s.id]) return;   // 没有数据的分类不显示
      const b = btn('wf-tab wf-st' + (cur === s.id ? ' on' : ''), s.name, () => { g.ui.status = s.id; g.ui.sel = 0; update(g, true); });
      if (states && s.id !== 'all') b.appendChild(el('small', '', String(states[s.id] || 0)));
      els.status.appendChild(b);
    });
  }
  function setShowAll(v) {
    showAll = !!v; flipped.clear();
    try { localStorage.setItem('wf_book_show', showAll ? '1' : '0'); } catch (e) {}
    if (els.maskBtn) { els.maskBtn.textContent = showAll ? '全部遮住' : '全部显示'; els.maskBtn.classList.toggle('hot', showAll); }
    if (root && !root.hidden) repaintRows();
  }
  const revealed = (w) => showAll !== flipped.has(w.word);

  // 换词库 / 搜索 / 筛选：重算列表；只是选中行变化：滚到可见
  function update(g, force) {
    if (!els.inner) return;
    const s = sigOf(g);
    if (force || s !== dataSig) {
      const was = dataSig;
      list = computeList(g);
      dataSig = s;
      if (s !== was) flipped.clear();
      if (s !== was) { els.list.scrollTop = 0; closeDetail(true); }
      if (mode !== 'wrong') buildStatus(g);
      if (s !== was) buildTabs(g);
    }
    if (g.ui.sel == null || g.ui.sel < 0) g.ui.sel = 0;
    if (list.length && g.ui.sel >= list.length) g.ui.sel = list.length - 1;
    els.count.innerHTML = '';
    els.count.append(mode === 'wrong' ? '错题 ' : '单词数 ', el('b', '', String(list.length)));
    els.maskBtn.textContent = showAll ? '全部遮住' : '全部显示'; els.maskBtn.classList.toggle('hot', showAll);
    const touch = isTouch();
    els.foot.textContent = touch
      ? '单击单词读音 · 双击单词看详情 · 点灰条看释义'
      : (mode === 'wrong'
        ? '连续答对 3 次会移出 · 单击读音 · 双击/D 详情 · ↑↓ 选词 · P 读 · 空格 显示释义 · Tab 切分类 · Enter 错题对战 · Esc 返回'
        : '单击读音 · 双击/Enter 详情 · ↑↓ 选词 · P 读单词 · 空格 显示释义 · A 全部显示 · Tab 切词库 · / 搜索 · Esc 返回');
    els.inner.style.height = (list.length * rowH()) + 'px';
    const old = els.list.querySelector('.wf-empty'); if (old) old.remove();
    if (!list.length) {
      const lb = mode !== 'wrong' && (g.banks || [])[g.ui.bank];
      let msg = '没有符合条件的词。';
      if (mode === 'wrong') msg = '这一类还没有错题。对战里答错的单词和短语会自动收进来。';
      else if (lb && lb.lazy && !lb.loaded) msg = WF.Banks.state(lb) === 'error' ? '「' + lb.name + '」词库下载失败，请检查网络后再点一次这个标签重试。' : '「' + lb.name + '」词库下载中…（首次约 ' + WF.Banks.sizeText(lb) + '）';
      els.list.insertBefore(el('div', 'wf-empty', msg), els.inner);
    }
    paint(g, true);
    requestAnimationFrame(prefetchVisible);
  }
  function scrollToSel(g) {
    const h = rowH(), sc = els.list, i = g.ui.sel || 0;
    const top = i * h;
    if (top < sc.scrollTop) sc.scrollTop = top;
    else if (top + h > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + h - sc.clientHeight;
  }
  // 虚拟列表：只画可见范围的行
  let painted = { a: -1, b: -1 };
  function paint(g, force) {
    if (!els.inner || !els.list.isConnected) return;
    const h = rowH(), sc = els.list;
    const a = Math.max(0, Math.floor(sc.scrollTop / h) - OVERSCAN);
    const b = Math.min(list.length, Math.ceil((sc.scrollTop + (sc.clientHeight || 400)) / h) + OVERSCAN);
    if (!force && a === painted.a && b === painted.b) return;
    painted = { a, b };
    const frag = document.createDocumentFragment();
    for (let i = a; i < b; i++) frag.appendChild(rowEl(g, i, h));
    els.inner.replaceChildren(frag);
  }
  function repaintRows() { if (W.game) paint(W.game, true); }
  function rowEl(g, i, h) {
    const w = list[i], r = el('div', 'wf-row' + (i === (g.ui.sel || 0) ? ' on' : '') + (i === saidI && Date.now() - saidT < 900 ? ' say' : ''));
    r.dataset.i = String(i); r.style.top = (i * h) + 'px'; r.style.height = h + 'px';
    const wc = el('div', 'wf-w');
    const m = mode === 'wrong' ? 'wrong' : masteryOf(g, w);
    if (m !== 'new') { const dt = el('span', 'wf-dot'); dt.style.background = (TAGS[m] || TAGS.new).color; dt.title = (TAGS[m] || TAGS.new).name; wc.appendChild(dt); }
    wc.appendChild(el('b', '', w.word || ''));
    if (w.kind === 'phrase') wc.appendChild(el('span', 'wf-miss', '短语'));
    r.appendChild(wc);
    const mc = el('div', 'wf-m ' + (revealed(w) ? 'open' : 'mask')), sp = el('span');
    const sm = shortMeaning(w);
    sm.forEach((s, k) => { if (k) sp.appendChild(document.createTextNode('；')); if (s.pos) sp.appendChild(el('i', '', s.pos)); sp.appendChild(document.createTextNode(s.zh)); });
    mc.title = revealed(w) ? '点一下遮住' : '点一下显示释义';
    mc.appendChild(sp); r.appendChild(mc);
    if (mode === 'wrong') r.appendChild(el('span', 'wf-bad', '错 ' + (w.wrongCount || 0)));
    return r;
  }
  function select(g, i) {
    g.ui.sel = i;
    els.inner.querySelectorAll('.wf-row.on').forEach(n => n.classList.remove('on'));
    const r = els.inner.querySelector('.wf-row[data-i="' + i + '"]'); if (r) r.classList.add('on');
  }
  function say(g, i) {
    const w = list[i]; if (!w || isMath(w)) return;
    saidI = i; saidT = Date.now();
    g.speakEntry(w, 'word');
    const r = els.inner.querySelector('.wf-row[data-i="' + i + '"]');
    if (r) { r.classList.add('say'); setTimeout(() => r.classList.remove('say'), 700); }
  }
  function toggleMask(g, i) {
    const w = list[i]; if (!w) return;
    if (flipped.has(w.word)) flipped.delete(w.word); else flipped.add(w.word);
    const r = els.inner.querySelector('.wf-row[data-i="' + i + '"]');
    if (r) r.replaceWith(rowEl(g, i, rowH()));
  }
  // 单击：单词 = 读音（立刻读，iOS 要求在点击里出声），灰条 = 显示 / 遮住；
  // 双击（同一行两次点击 < 330ms）= 打开详细页；第二下不再读、灰条恢复原状。
  function onRowClick(g, e) {
    const r = e.target.closest && e.target.closest('.wf-row'); if (!r) return;
    const i = +r.dataset.i, now = Date.now();
    const zone = e.target.closest('.wf-m') ? 'm' : 'w';
    const dbl = lastTap.i === i && now - lastTap.t < DBL_MS;
    if (dbl) {
      if (lastTap.zone === 'm') toggleMask(g, i);   // 撤销第一下的翻开
      lastTap = { i: -1, t: 0, zone: '' };
      if (WF.Speech) WF.Speech.stop();
      openDetail(g, i);
      return;
    }
    lastTap = { i, t: now, zone };
    select(g, i);
    if (zone === 'm') toggleMask(g, i); else say(g, i);
  }

  // ---------- 详细页 ----------
  function openDetail(g, i) {
    const w = list[i]; if (!w) return;
    select(g, i); detailI = i;
    const d = els.detail; d.innerHTML = '';
    const head = el('div', 'wf-dhead');
    head.appendChild(btn('wf-btn wf-dclose', '返回', (e) => { e.stopPropagation(); closeDetail(); }));
    const wd = el('div', 'wf-dword', w.word || ''); wd.title = '点一下读音';
    wd.dataset.say = '1';
    head.appendChild(wd);
    const ipa = g.ipaText(w); if (ipa) head.appendChild(el('div', 'wf-dipa', ipa));
    if (mode === 'wrong') {
      const bankName = ((g.banks || []).find(b => b.id === w.bank) || {}).name || w.bank || '';
      const ds = w.lastWrong ? new Date(w.lastWrong) : null;
      const t = el('div', 'wf-dtag', (bankName ? bankName + ' · ' : '') + '错 ' + (w.wrongCount || 0) + ' 次' + (ds ? ' · ' + (ds.getMonth() + 1) + '月' + ds.getDate() + '日' : ''));
      t.style.color = '#ff6a6a'; head.appendChild(t);
    } else {
      const tg = TAGS[masteryOf(g, w)] || TAGS.new, t = el('div', 'wf-dtag', tg.name); t.style.color = tg.color; head.appendChild(t);
    }
    head.appendChild(el('div', 'wf-dhint', isTouch() ? '双击返回' : '双击 / Esc 返回'));
    d.appendChild(head);
    const body = el('div', 'wf-dbody');
    const senses = w.kind === 'phrase' ? [{ zh: w.meaning || '', ex: w.ex ? [{ en: w.ex, zh: w.exZh || '' }] : [] }] : WF.Quiz.senses(w), missed = new Set(w.wrongSenses || []);
    senses.forEach(sn => {
      const row = el('div', 'wf-sense'), hd = el('div', 'wf-meaning');
      if (sn.pos) hd.appendChild(el('span', 'wf-pos', sn.pos));
      hd.appendChild(document.createTextNode(sn.zh || ''));
      if (mode === 'wrong' && missed.has(sn.id)) hd.appendChild(el('span', 'wf-miss', '答错过'));
      row.appendChild(hd);
      const ph = (sn.phrases || []).filter(x => x && x.en);
      if (ph.length) {
        row.appendChild(el('div', 'wf-lbl', '常用搭配'));
        const pr = el('div', 'wf-phr');
        ph.forEach(x => { const s = el('span', '', x.en); if (x.zh) s.appendChild(el('i', '', x.zh)); if (P && WF.Profiles.phraseWrong(P.id, bankIdOf(g, w), x.en)) s.appendChild(el('span', 'wf-miss', '答错过')); pr.appendChild(s); });
        row.appendChild(pr);
      }
      const exs = (sn.ex || []).map(x => partsOf(g, { ex: x.en, exZh: x.zh })).filter(x => x.en || x.zh);
      if (exs.length) {
        row.appendChild(el('div', 'wf-lbl', '例句'));
        exs.forEach(x => { if (x.en) row.appendChild(el('div', 'wf-ex', x.en)); if (x.zh) row.appendChild(el('div', 'wf-exzh', x.zh)); });
      }
      body.appendChild(row);
    });
    d.appendChild(body);
    d.hidden = false; lastDetailTap = 0;
    if (els.search && document.activeElement === els.search) els.search.blur();
  }
  function closeDetail(silent) {
    if (!els.detail || els.detail.hidden) return;
    els.detail.hidden = true; els.detail.innerHTML = ''; detailI = -1;
    if (!silent && W.game) { scrollToSel(W.game); paint(W.game, true); }
  }
  function onDetailClick(g, e) {
    const now = Date.now();
    if (now - lastDetailTap < DBL_MS) { lastDetailTap = 0; if (WF.Speech) WF.Speech.stop(); closeDetail(); return; }
    lastDetailTap = now;
    if (e.target.closest && e.target.closest('[data-say]')) say(g, detailI);
  }

  const prefetchVisible = () => {
    if (!WF.Speech || !WF.Speech.prefetch || !els.list || !els.list.isConnected) return;
    const first = Math.floor(els.list.scrollTop / rowH()), words = [];
    for (let k = first; k < list.length && words.length < 14; k++) { const w = list[k]; if (w && w.word && !isMath(w)) words.push(w.word); }
    WF.Speech.prefetch(words);
  };

  function refresh(g, force) {
    if (!g) return;
    ensure();
    const next = (g.ui.screen === 'wrongbook') ? 'wrong' : 'book';
    if (!els.inner || mode !== next || root.hidden) { mode = next; dataSig = ''; build(g); return; }
    if (sigOf(g) !== dataSig) { update(g, true); return; }
    if (!force) return;
    // 只是选中行变化（↑↓）就不重算列表；词库下载完 / 错题变了（原始条数变化）才重算
    if (rawLenCheck(g) !== rawN) update(g, true);
    if (g.ui.sel == null || g.ui.sel < 0) g.ui.sel = 0;
    if (list.length && g.ui.sel >= list.length) g.ui.sel = list.length - 1;
    scrollToSel(g); paint(g, true);
  }
  function rawLenCheck(g) { return mode === 'wrong' ? (P ? WF.Profiles.wrongList(P.id, g.ui.bankFilter || 'all').length : 0) : (g.bookWords() || []).length; }

  W.BookUI = {
    open(g, which) {
      mode = which === 'wrong' ? 'wrong' : 'book';
      if (mode === 'book' && !g.ui.status) g.ui.status = 'all';
      ensure().hidden = false;
      dataSig = ''; list = []; flipped.clear(); painted = { a: -1, b: -1 };
      build(g);
    },
    hide() {
      if (root) root.hidden = true;
      if (els._resize) window.removeEventListener('resize', els._resize);
      mode = ''; dataSig = ''; detailI = -1;
    },
    ensure(g) {
      if (!g) return;
      const sc = g.ui && g.ui.screen;
      if (sc === 'book' || sc === 'wrongbook') {
        if (!root || root.hidden) this.open(g, sc === 'wrongbook' ? 'wrong' : 'book');
      } else if (root && !root.hidden) {
        this.hide();
      }
    },
    refresh,
    visible() { return !!(root && !root.hidden); },
    root() { return root; },
    // 键盘 / 测试用
    list() { return list; },
    detailOpen() { return detailI >= 0; },
    openDetail(g, i) { openDetail(g, i == null ? (g.ui.sel || 0) : i); },
    closeDetail() { closeDetail(); },
    toggleMask(g, i) { toggleMask(g, i == null ? (g.ui.sel || 0) : i); },
    setShowAll, get showAll() { return showAll; },
    say(g, i) { say(g, i == null ? (g.ui.sel || 0) : i); },
    rowHeight: rowH,
  };
})();
