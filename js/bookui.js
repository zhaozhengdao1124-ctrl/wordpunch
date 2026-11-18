// 单词书 / 错题本：清晰的 HTML 图层，不走像素画布。对战和菜单仍是像素风。
(function () {
  const W = window.WF = window.WF || {};
  const FONT = "'Segoe UI','Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif";
  const FONT_IPA = "'Segoe UI','Charis SIL','Doulos SIL','Noto Sans','Arial Unicode MS','Lucida Sans Unicode',sans-serif";
  const TAGS = {
    new: { name: '未学', color: '#8a90a8' },
    seen: { name: '见过', color: '#e8e0f4' },
    mastered: { name: '已掌握', color: '#7dff9a' },
    wrong: { name: '错题本', color: '#ff6a6a' },
  };

  const css = `
#wf-dict[hidden]{display:none !important;}
#wf-dict{
  position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;
  background:#100a18;color:#f4eefc;
  font-family:${FONT};
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  text-rendering:optimizeLegibility;
  image-rendering:auto;
}
#wf-dict *{box-sizing:border-box;image-rendering:auto;}
#wf-dict .wf-bar{
  flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;
  padding:16px 20px 12px;border-bottom:1px solid #3a2f55;
  background:linear-gradient(180deg,#1a1230,#140c22);
}
#wf-dict .wf-back{
  appearance:none;border:1px solid #5d4f86;background:#1b1430;color:#e9d7a6;
  font:600 15px ${FONT};padding:8px 14px;border-radius:8px;cursor:pointer;
}
#wf-dict .wf-back:hover,#wf-dict .wf-tab:hover,#wf-dict .wf-speak:hover,#wf-dict .wf-fight:hover{border-color:#ffd23c;color:#ffd23c;}
#wf-dict h1{
  margin:0;flex:1 1 auto;font:700 22px ${FONT};color:#ffd23c;letter-spacing:.02em;
}
#wf-dict .wf-tabs{display:flex;flex-wrap:wrap;gap:8px;width:100%;}
#wf-dict .wf-tab{
  appearance:none;border:1px solid #5d4f86;background:#1b1430;color:#fff;
  font:600 14px ${FONT};padding:6px 12px;border-radius:999px;cursor:pointer;
}
#wf-dict .wf-tab.on{background:#ffd23c22;border-color:#ffd23c;color:#ffd23c;}
#wf-dict .wf-search{
  flex:1 1 240px;min-width:200px;height:40px;padding:0 14px;
  border:1px solid #e9d7a6;border-radius:10px;background:#0c0814;color:#fff;
  font:16px/1.2 ${FONT};outline:none;box-shadow:none;
}
#wf-dict .wf-search::placeholder{color:#8f86b8;}
#wf-dict .wf-search:focus{border-color:#ffd23c;box-shadow:0 0 0 3px #ffd23c33;}
#wf-dict .wf-fight{
  appearance:none;border:1px solid #ffd23c;background:#ffd23c22;color:#ffd23c;
  font:700 15px ${FONT};padding:8px 16px;border-radius:8px;cursor:pointer;
}
#wf-dict .wf-list{flex:1 1 auto;overflow:auto;padding:16px 20px 8px;display:flex;flex-direction:column;gap:12px;}
#wf-dict .wf-empty{margin:60px 20px;text-align:center;color:#bfb3d6;font-size:18px;line-height:1.6;}
#wf-dict .wf-card{
  background:#1b1430;border:1px solid #5d4f86;border-radius:12px;padding:16px 18px 14px;
}
#wf-dict .wf-card.on{border-color:#ffd23c;background:#241a3a;box-shadow:0 0 0 1px #ffd23c55;}
#wf-dict .wf-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
#wf-dict .wf-word{font-size:28px;line-height:1.2;font-weight:700;color:#ffd23c;font-family:${FONT};}
#wf-dict .wf-speak{
  appearance:none;flex:0 0 auto;width:36px;height:36px;padding:0;border-radius:50%;
  border:1px solid #e9d7a6;background:#2a2044;color:#ffd23c;cursor:pointer;
  font-size:16px;line-height:36px;text-align:center;
}
#wf-dict .wf-speak:active{transform:scale(.96);}
#wf-dict .wf-meta{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px;color:#bfb3d6;}
#wf-dict .wf-tag{font-weight:700;}
#wf-dict .wf-ipa{margin-top:6px;font:18px/1.4 ${FONT_IPA};color:#c8bddc;}
#wf-dict .wf-meaning{margin-top:6px;font:18px/1.45 ${FONT};color:#ffffff;}
#wf-dict .wf-sense{margin-top:10px;padding-left:2px;}
#wf-dict .wf-sense+.wf-sense{border-top:1px dashed #3a2f55;padding-top:10px;}
#wf-dict .wf-pos{display:inline-block;min-width:40px;margin-right:10px;padding:1px 8px;border-radius:6px;background:#2a2044;color:#8fd0ff;font:700 14px ${FONT};text-align:center;vertical-align:2px;}
#wf-dict .wf-miss{margin-left:10px;color:#ff6a6a;font:700 13px ${FONT};}
#wf-dict .wf-ex{margin-top:6px;font:17px/1.5 ${FONT};color:#e9d7a6;white-space:normal;word-wrap:break-word;overflow-wrap:anywhere;}
#wf-dict .wf-phr{margin-top:6px;display:flex;flex-wrap:wrap;gap:6px 8px;}
#wf-dict .wf-phr span{display:inline-block;padding:2px 10px;border-radius:12px;background:#231a3c;border:1px solid #4a3d72;font:15px/1.5 ${FONT};color:#ffe9a0;}
#wf-dict .wf-phr span i{font-style:normal;color:#bfb3d6;margin-left:6px;}
#wf-dict .wf-exzh{margin-top:4px;font:16px/1.5 ${FONT};color:#bfb3d6;white-space:normal;word-wrap:break-word;overflow-wrap:anywhere;}
#wf-dict .wf-foot{
  flex:0 0 auto;padding:10px 20px 14px;color:#bfb3d6;font-size:13px;text-align:center;
  border-top:1px solid #3a2f55;background:#140c22;
}
`.replace(/\n/g, '');

  let root = null, mode = '', sig = '', built = false;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function iconSpeak() {
    const b = el('button', 'wf-speak');
    b.type = 'button';
    b.title = '朗读单词';
    b.setAttribute('aria-label', '朗读单词');
    b.textContent = '♪';
    return b;
  }
  function ensure() {
    if (root) return root;
    let style = document.getElementById('wf-dict-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'wf-dict-style';
      style.textContent = css;
      document.head.appendChild(style);
    }
    root = document.getElementById('wf-dict');
    if (!root) {
      root = el('div');
      root.id = 'wf-dict';
      document.body.appendChild(root);
    }
    root.hidden = true;
    return root;
  }
  function partsOf(g, w) {
    return (g.exampleParts && g.exampleParts(w)) || { en: (w && w.ex) || '', zh: (w && w.exZh) || '' };
  }
  function currentList(g) {
    if (mode === 'wrong') {
      const p = WF.Profiles.get(g.menu.p1);
      const raw = p ? WF.Profiles.wrongList(p.id, g.ui.bankFilter || 'all') : [];
      return raw.map(h => g.enrichEntry(h));
    }
    return g.bookWords() || [];
  }
  function signature(g) {
    const list = currentList(g);
    return [mode, g.menu.p1, g.ui.bank, g.ui.query || '', g.ui.bankFilter || '', g.ui.sel || 0, list.length,
      list[0] && list[0].word, list[list.length - 1] && list[list.length - 1].word].join('|');
  }

  function build(g) {
    const box = ensure();
    box.innerHTML = '';
    const p = WF.Profiles.get(g.menu.p1);
    const isWrong = mode === 'wrong';
    const bar = el('div', 'wf-bar');
    const back = el('button', 'wf-back', '返回');
    back.type = 'button';
    back.addEventListener('click', () => { if (WF.Speech) WF.Speech.stop(); g.goTitle(); g.render(); });
    bar.appendChild(back);
    bar.appendChild(el('h1', '', (p ? p.name + ' 的' : '') + (isWrong ? '错题本' : '单词书')));
    if (isWrong) {
      const fight = el('button', 'wf-fight', '错题对战');
      fight.type = 'button';
      fight.addEventListener('click', () => g.requestStart(true));
      bar.appendChild(fight);
    } else {
      const search = el('input', 'wf-search');
      search.type = 'search';
      search.placeholder = '搜索单词 / 释义';
      search.value = g.ui.query || '';
      search.autocomplete = 'off';
      search.spellcheck = false;
      search.addEventListener('input', () => {
        g.ui.query = search.value;
        g.ui.sel = 0;
        refresh(g, true);
      });
      bar.appendChild(search);
    }
    const tabs = el('div', 'wf-tabs');
    const tabItems = isWrong
      ? [{ id: 'all', name: '全部' }].concat((g.banks || []).map(b => ({ id: b.id, name: b.name })))
      : (g.banks || []).map((b, i) => ({ id: i, name: b.name }));
    tabItems.forEach((t, i) => {
      const on = isWrong ? (g.ui.bankFilter || 'all') === t.id : (g.ui.bank === i);
      const b = el('button', 'wf-tab' + (on ? ' on' : ''), t.name);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (WF.Speech) WF.Speech.stop();
        if (isWrong) g.ui.bankFilter = t.id; else { g.ui.bank = t.id; if (g.bankRetry) g.bankRetry(t.id); }
        g.ui.sel = 0;
        refresh(g, true);
      });
      tabs.appendChild(b);
    });
    bar.appendChild(tabs);
    box.appendChild(bar);

    const list = currentList(g);
    if (g.ui.sel == null || g.ui.sel < 0) g.ui.sel = 0;
    if (list.length && g.ui.sel >= list.length) g.ui.sel = list.length - 1;
    const scroller = el('div', 'wf-list');
    if (!list.length) {
      const lb = !isWrong && (g.banks || [])[g.ui.bank];
      scroller.appendChild(el('div', 'wf-empty', isWrong ? '这一类还没有错题。对战里答错的单词会自动收进来。' : (lb && lb.lazy && !lb.loaded ? (WF.Banks.state(lb) === 'error' ? '「' + lb.name + '」词库下载失败，请检查网络后再点一次这个标签重试。' : '「' + lb.name + '」词库下载中…（首次约 ' + WF.Banks.sizeText(lb) + '）') : '没有符合条件的词。')));
    }
    list.forEach((w, i) => {
      const card = el('article', 'wf-card' + (i === g.ui.sel ? ' on' : ''));
      card.dataset.i = String(i);
      card.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('.wf-speak')) return;
        g.ui.sel = i;
        box.querySelectorAll('.wf-card.on').forEach(n => n.classList.remove('on'));
        card.classList.add('on');
      });
      const top = el('div', 'wf-top');
      top.appendChild(el('span', 'wf-word', w.word || ''));
      if (w.word) {
        const sp = iconSpeak();
        sp.addEventListener('pointerenter', () => { if (WF.Speech && WF.Speech.warm && w.kind !== 'math' && w.bank !== 'math') WF.Speech.warm(w.word); });
        sp.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          g.ui.sel = i;
          g.speakEntry(w, 'word');
        });
        top.appendChild(sp);
      }
      const meta = el('div', 'wf-meta');
      if (isWrong) {
        const bankName = ((g.banks || []).find(b => b.id === w.bank) || {}).name || w.bank || '';
        if (bankName) meta.appendChild(el('span', '', bankName));
        const ds = w.lastWrong ? new Date(w.lastWrong) : null;
        const dsText = ds ? (ds.getMonth() + 1) + '月' + ds.getDate() + '日' : '';
        meta.appendChild(el('span', '', '错 ' + (w.wrongCount || 0) + ' 次' + (dsText ? ' · ' + dsText : '')));
      } else {
        const m = p ? WF.Profiles.mastery(p.id, (g.banks[g.ui.bank] || {}).id, w.word) : 'new';
        const tg = TAGS[m] || TAGS.new;
        const tag = el('span', 'wf-tag', tg.name);
        tag.style.color = tg.color;
        meta.appendChild(tag);
      }
      top.appendChild(meta);
      card.appendChild(top);
      const ipa = g.ipaText(w);
      if (ipa) card.appendChild(el('div', 'wf-ipa', ipa));
      // v1.3：按词性分组列出所有义项，每个义项下面是它的例句（英文 + 中文各一行）
      const senses = WF.Quiz.senses(w), missed = new Set(w.wrongSenses || []);
      senses.forEach(sn => {
        const row = el('div', 'wf-sense');
        const head = el('div', 'wf-meaning');
        if (sn.pos) head.appendChild(el('span', 'wf-pos', sn.pos));
        head.appendChild(document.createTextNode(sn.zh || ''));
        if (isWrong && missed.has(sn.id)) head.appendChild(el('span', 'wf-miss', '答错过'));
        row.appendChild(head);
        // v1.4 常用短语（GPT 交回的 phrases：[{en, zh}]），放在例句上面
        const ph = (sn.phrases || []).filter(x => x && x.en);
        if (ph.length) {
          const pr = el('div', 'wf-phr');
          ph.forEach(x => { const sp = el('span', '', x.en); if (x.zh) sp.appendChild(el('i', '', x.zh)); pr.appendChild(sp); });
          row.appendChild(pr);
        }
        (sn.ex || []).forEach(x => {
          const ex = partsOf(g, { ex: x.en, exZh: x.zh });
          if (ex.en) row.appendChild(el('div', 'wf-ex', ex.en));
          if (ex.zh) row.appendChild(el('div', 'wf-exzh', ex.zh));
        });
        card.appendChild(row);
      });
      scroller.appendChild(card);
    });
    box.appendChild(scroller);
    // v1.7.2：预载屏幕上看得到的词（和往下一屏）的有道发音；滚动时节流更新；鼠标移到喇叭上也先预载这个词
    const prefetchVisible = () => {
      if (!WF.Speech || !WF.Speech.prefetch || !scroller.isConnected) return;
      const top = scroller.getBoundingClientRect().top, cards = scroller.children, words = [];
      // 二分找到第一张露出来的卡（列表可能有几千张），从它开始取 12 个词（约当前一屏 + 往下两屏）
      let lo = 0, hi = cards.length - 1, first = 0;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (cards[m].getBoundingClientRect().bottom < top) { lo = m + 1; } else { first = m; hi = m - 1; } }
      for (let k = first; k < cards.length && words.length < 12; k++) {
        const c = cards[k]; if (!c.dataset || c.dataset.i == null) continue;
        const w = list[+c.dataset.i]; if (w && w.word && w.kind !== 'math' && w.bank !== 'math') words.push(w.word);
      }
      WF.Speech.prefetch(words);
    };
    let pfT = null;
    scroller.addEventListener('scroll', () => { if (pfT) return; pfT = setTimeout(() => { pfT = null; prefetchVisible(); }, 150); }, { passive: true });
    requestAnimationFrame(() => requestAnimationFrame(prefetchVisible));
    const foot = el('div', 'wf-foot',
      (isWrong
        ? ('共 ' + list.length + ' 条 · 连续答对 3 次会移出 · ↑↓ 选词 · P 读单词 · Tab 切分类 · Enter 错题对战 · Esc 返回')
        : ('共 ' + list.length + ' 词 · ↑↓ 选词 · P 读单词 · Tab 切词库 · Esc 返回')));
    box.appendChild(foot);
    const on = scroller.querySelector('.wf-card.on');
    if (on && typeof on.scrollIntoView === 'function') on.scrollIntoView({ block: 'nearest' });
    sig = signature(g);
  }

  function refresh(g, force) {
    if (!g) return;
    ensure();
    const next = (g.ui.screen === 'wrongbook') ? 'wrong' : 'book';
    if (!force && root && !root.hidden && mode === next && sig === signature(g)) return;
    mode = next;
    build(g);
  }

  W.BookUI = {
    open(g, which) {
      mode = which === 'wrong' ? 'wrong' : 'book';
      ensure().hidden = false;
      refresh(g, true);
    },
    hide() {
      if (root) root.hidden = true;
      mode = '';
      sig = '';
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
  };
})();
