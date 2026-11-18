// 启动、30fps 固定步长主循环、键盘/鼠标输入、测试钩子
(function () {
  const C = WF.CFG;
  let game = null, manual = false, acc = 0, last = 0;
  let textEl = null;

  function ensureText() {
    if (textEl) return textEl;
    textEl = document.createElement('input');
    textEl.type = 'text'; textEl.maxLength = 40; textEl.autocomplete = 'off';
    textEl.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:-1000px;top:0;font-size:20px;';
    document.body.appendChild(textEl);
    textEl.addEventListener('input', () => {
      const g = game; if (!g) return;
      if (g.ui.screen === 'book' && g.ui.typing) { g.ui.query = textEl.value; g.ui.page = 0; g.render(); }
      if ((g.ui.sub === 'create' || g.ui.sub === 'rename') && g.ui.typing) { g.ui.nameValue = textEl.value.slice(0, 8); g.render(); }
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finishText(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finishText(false); }
      e.stopPropagation();
    });
    return textEl;
  }
  function startText(initial, maxlen) {
    const el = ensureText();
    el.maxLength = maxlen || 40;
    el.value = initial || '';
    game.ui.typing = true;
    el.style.pointerEvents = 'auto';
    // place over canvas so IME follows
    const r = game.cv.getBoundingClientRect();
    el.style.opacity = '0';
    el.style.left = r.left + r.width / 2 - 80 + 'px';
    el.style.top = r.top + 40 + 'px';
    el.style.width = '160px';
    setTimeout(() => el.focus(), 0);
  }
  function finishText(ok) {
    const g = game; if (!g || !g.ui.typing) return;
    const val = textEl ? textEl.value : '';
    g.ui.typing = false;
    if (textEl) { textEl.blur(); textEl.style.pointerEvents = 'none'; textEl.style.left = '-1000px'; }
    if (g.ui.screen === 'book') {
      if (ok) g.ui.query = val; g.render(); return;
    }
    if (g.ui.sub === 'create' || g.ui.sub === 'rename') {
      g.ui.nameValue = val.slice(0, 8);
      if (ok) submitName();
      g.render();
    }
  }
  function submitName() {
    const g = game, name = (g.ui.nameValue || '').trim();
    if (!name) return;
    if (g.ui.sub === 'create') {
      const r = WF.Profiles.create(name, WF.Profiles.AVATARS[g.ui.avatar || 0].id);
      if (r.profile) {
        const side = g.ui.side || 0;
        if (side === 0) g.menu.p1 = r.profile.id; else g.menu.p2 = r.profile.id;
        g.persistMenu();
        g.ui.sub = 'list'; g.ui.sel = WF.Profiles.list().length - 1;
      }
    } else if (g.ui.sub === 'rename') {
      const list = WF.Profiles.list(), p = list[g.ui.editIndex] || list[g.ui.sel];
      if (p) { WF.Profiles.rename(p.id, name); g.ui.sub = 'list'; }
    }
  }

  function frame(ts) {
    if (!manual && WF.hold) { last = 0; acc = 0; }
    else if (!manual) {
      if (!last) last = ts;
      acc += Math.min(250, ts - last); last = ts;
      const step = 1000 / C.FPS; let n = 0;
      while (acc >= step && n < 5) { game.update(); acc -= step; n++; }
      if (n) game.render();
    }
    requestAnimationFrame(frame);
  }

  function titleKey(g, code) {
    const sc = g.ui.screen || 'title';
    if (sc === 'charsel') return charselKey(g, code);
    if (sc === 'profiles') return profilesKey(g, code);
    if (sc === 'book') return bookKey(g, code);
    if (sc === 'wrongbook') return wrongKey(g, code);
    if (sc === 'settings') return settingsKey(g, code);
    if (sc === 'achievements') return g.achKey(code);   // v1.7.1 成就页
    if (sc === 'growth') return g.growKey(code);   // v1.7.1 角色成长
    if (sc === 'daily') return g.dailyKey(code);   // v1.7.1 每日任务
    if (sc === 'codex') return g.codexKey(code);   // v1.8 收藏 / 图鉴
    const items = g.homeButtons();
    if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowLeft') { g.menu.row = (g.menu.row + items.length - 1) % items.length; WF.Audio.play('menu'); }
    else if (code === 'ArrowDown' || code === 'KeyS' || code === 'ArrowRight') { g.menu.row = (g.menu.row + 1) % items.length; WF.Audio.play('menu'); }
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') g.menuAct(items[g.menu.row].key, 1);
    else if (code === 'KeyB') g.goBook();
    else if (code === 'KeyE') g.goWrong();
    else if (code === 'KeyO' || code === 'Comma') g.goSettings();
  }
  function settingsKey(g, code) {
    const items = g.settingsItems();
    if (code === 'Escape') { g.ui.screen = 'title'; g.menu.row = 0; return; }
    if (code === 'ArrowUp' || code === 'KeyW') { g.menu.row = (g.menu.row + items.length - 1) % items.length; WF.Audio.play('menu'); }
    else if (code === 'ArrowDown' || code === 'KeyS') { g.menu.row = (g.menu.row + 1) % items.length; WF.Audio.play('menu'); }
    else if (code === 'ArrowLeft' || code === 'KeyA') g.menuAct(items[g.menu.row].key, -1);
    else if (code === 'ArrowRight' || code === 'KeyD' || code === 'Enter' || code === 'NumpadEnter' || code === 'Space') g.menuAct(items[g.menu.row].key, 1);
  }
  function charselKey(g, code) {
    if (code === 'ArrowLeft' || code === 'KeyA') g.charselMove(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') g.charselMove(1);
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') g.confirmChar();
    else if (code === 'Tab' && g.charselMode() === 'cpu') { g.rollCpuChar(WF.CFG.ROSTER[g.ui.sel]); g.charselPreview(); WF.Audio.play('menu'); }
    else if (code === 'KeyR' && g.charselMode() === 'camp' && g.toggleCampMode) g.toggleCampMode();   // v1.7 剧情 / 挑战
    else if (code === 'KeyG' && g.goGrow) g.goGrow('charsel');   // v1.7.1 角色成长
    else if (code === 'KeyT' && g.cycleDiff && (g.charselMode() === 'camp' || g.charselMode() === 'cpu')) g.cycleDiff(1);   // v1.7.1 难度
    else if (g.skinKey && g.skinKey(code)) { /* v1.8 换外观：↑↓ / W S */ }
    else if (code === 'Escape') g.charselBack();
  }
  function profilesKey(g, code) {
    if (g.ui.confirm) {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'KeyY') {
        WF.Profiles.remove(g.ui.confirm.id); g.ui.confirm = null; g.ui.sel = 0; g.ui.sub = 'list';
        if (!WF.Profiles.get(g.menu.p1)) g.menu.p1 = (WF.Profiles.list()[0] || {}).id;
        if (g.menu.p2 && !WF.Profiles.get(g.menu.p2)) g.menu.p2 = null;
        g.persistMenu();
      } else if (code === 'Escape' || code === 'KeyN') g.ui.confirm = null;
      return;
    }
    if (g.ui.sub === 'create' || g.ui.sub === 'rename') {
      if (code === 'Escape') { g.ui.sub = 'list'; g.ui.typing = false; if (textEl) textEl.blur(); }
      else if (code === 'ArrowLeft' || code === 'KeyA') { g.ui.avatar = (g.ui.avatar + WF.Profiles.AVATARS.length - 1) % WF.Profiles.AVATARS.length; }
      else if (code === 'ArrowRight' || code === 'KeyD') { g.ui.avatar = (g.ui.avatar + 1) % WF.Profiles.AVATARS.length; }
      else if (code === 'Enter' || code === 'NumpadEnter') { if (g.ui.typing) finishText(true); else submitName(); }
      return;
    }
    const list = WF.Profiles.list();
    if (g.ui.sub !== 'actions') g.ui.sub = 'list';
    if (code === 'Escape') {
      g.ui.confirm = null; g.ui.sub = 'list'; g.ui.typing = false;
      if (g.ui.then === 'book') g.goBook();
      else if (g.ui.then === 'wrong') g.goWrong();
      else { g.ui.screen = 'title'; g.menu.row = 0; }
      return;
    }
    if (code === 'KeyN') { beginCreate(g); return; }
    if (code === 'KeyR') { beginRename(g); return; }
    if (code === 'Delete' || code === 'Backspace') { beginDelete(g); return; }
    if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS' || code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
      if (!list.length) return;
      const cols = 2;
      let i = g.ui.sel || 0;
      if (code === 'ArrowLeft' || code === 'KeyA') i = (i + list.length - 1) % list.length;
      if (code === 'ArrowRight' || code === 'KeyD') i = (i + 1) % list.length;
      if (code === 'ArrowUp' || code === 'KeyW') i = (i + list.length - cols) % list.length;
      if (code === 'ArrowDown' || code === 'KeyS') i = (i + cols) % list.length;
      g.ui.sel = i; WF.Audio.play('menu');
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      const p = list[g.ui.sel]; if (!p) return;
      const side = g.ui.side || 0;
      if (side === 0) { g.menu.p1 = p.id; WF.Profiles.applyBgm(p.id); } else g.menu.p2 = p.id;
      g.persistMenu(); WF.Audio.play('menu');
      if (g.ui.then === 'start') g.requestStart(g.menu.wrongMatch);
      else if (g.ui.then === 'campaign') g.requestCampaign();
      else if (g.ui.then === 'book') g.goBook();
      else if (g.ui.then === 'wrong') g.goWrong();
      else g.ui.screen = 'title';
    }
  }
  function beginCreate(g) {
    if (WF.Profiles.list().length >= WF.Profiles.MAX) return;
    g.ui.sub = 'create'; g.ui.nameValue = ''; g.ui.avatar = 0;
    startText('', 8);
  }
  function beginRename(g) {
    const p = WF.Profiles.list()[g.ui.sel]; if (!p) return;
    g.ui.sub = 'rename'; g.ui.editIndex = g.ui.sel; g.ui.nameValue = p.name;
    startText(p.name, 8);
  }
  function beginDelete(g) {
    const p = WF.Profiles.list()[g.ui.sel]; if (!p) return;
    g.ui.confirm = { id: p.id, name: p.name };
  }
  function bookSlice(g) {
    const words = g.bookWords(), per = g.bookPageSize(), page = g.ui.page || 0;
    return words.slice(page * per, page * per + per);
  }
  function bookList(g) { return g.bookWords() || []; }
  function bookKey(g, code) {
    const search = document.querySelector('#wf-dict .wf-search');
    if (search && document.activeElement === search) {
      if (code === 'Escape') { search.blur(); if (WF.Speech) WF.Speech.stop(); g.goTitle(); }
      return;
    }
    if (code === 'Escape') { if (WF.Speech) WF.Speech.stop(); g.goTitle(); return; }
    if (code === 'Slash') { if (search) { search.focus(); search.select && search.select(); } return; }
    if (code === 'Tab') { g.ui.bank = (g.ui.bank + 1) % g.banks.length; if (g.bankRetry) g.bankRetry(g.ui.bank); g.ui.sel = 0; if (WF.Speech) WF.Speech.stop(); if (WF.BookUI) WF.BookUI.refresh(g, true); return; }
    const sl = bookList(g);
    if (code === 'ArrowUp' || code === 'KeyW') {
      if (!sl.length) return;
      g.ui.sel = Math.max(0, (g.ui.sel || 0) - 1);
      if (WF.BookUI) WF.BookUI.refresh(g, true);
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      if (!sl.length) return;
      g.ui.sel = Math.min(sl.length - 1, (g.ui.sel || 0) + 1);
      if (WF.BookUI) WF.BookUI.refresh(g, true);
    }
    if (code === 'Home') { g.ui.sel = 0; if (WF.BookUI) WF.BookUI.refresh(g, true); }
    if (code === 'KeyP' || code === 'Digit1') { const e = sl[g.ui.sel || 0]; g.speakEntry(e, 'word'); }
  }
  function wrongSlice(g) {
    const p = WF.Profiles.get(g.menu.p1); if (!p) return [];
    const list = WF.Profiles.wrongList(p.id, g.ui.bankFilter || 'all');
    const per = g.wrongPageSize(), page = g.ui.page || 0;
    return list.slice(page * per, page * per + per);
  }
  function wrongListAll(g) {
    const p = WF.Profiles.get(g.menu.p1); if (!p) return [];
    return WF.Profiles.wrongList(p.id, g.ui.bankFilter || 'all').map(h => g.enrichEntry(h));
  }
  function wrongKey(g, code) {
    if (code === 'Escape') { if (WF.Speech) WF.Speech.stop(); g.goTitle(); return; }
    const filters = ['all'].concat(g.banks.map(b => b.id));
    if (code === 'Tab') {
      const i = filters.indexOf(g.ui.bankFilter || 'all');
      g.ui.bankFilter = filters[(i + 1) % filters.length]; g.ui.sel = 0;
      if (WF.Speech) WF.Speech.stop();
      if (WF.BookUI) WF.BookUI.refresh(g, true);
    }
    const sl = wrongListAll(g);
    if (code === 'ArrowUp' || code === 'KeyW') {
      if (!sl.length) return;
      g.ui.sel = Math.max(0, (g.ui.sel || 0) - 1);
      if (WF.BookUI) WF.BookUI.refresh(g, true);
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      if (!sl.length) return;
      g.ui.sel = Math.min(sl.length - 1, (g.ui.sel || 0) + 1);
      if (WF.BookUI) WF.BookUI.refresh(g, true);
    }
    if (code === 'KeyP' || code === 'Digit1') { const e = sl[g.ui.sel || 0]; g.speakEntry(e, 'word'); }
    if (code === 'Enter' || code === 'NumpadEnter') g.requestStart(true);
  }

  function onKey(e) {
    WF.Audio.unlock();
    const code = e.code;
    if (e.repeat) { e.preventDefault(); return; }
    if (code === 'KeyF') { const el = document.documentElement; if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen(); else document.exitFullscreen(); return; }
    const g = game;
    if (g.bankLoad) { g.bankLoadInput(); e.preventDefault(); g.render(); return; }   // v1.8 词库下载中：Esc/任意键取消
    if (g.unlockShow && g.unlockShow.length) { if (g.unlockShow[0].t > 20) g.unlockShow.shift(); e.preventDefault(); g.render(); return; } // v1.4 解锁卡片：任意键继续
    if (g.ui && g.ui.typing && g.state === 'title') { /* input element handles it */ e.preventDefault(); return; }
    if (g.state === 'title') { titleKey(g, code); e.preventDefault(); g.render(); return; }
    if (g.camp && g.campKey(code)) { e.preventDefault(); g.render(); return; }
    if (g.state === 'result') {
      if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') g.startMatch();
      else if (code === 'Escape') g.goTitle();
      e.preventDefault(); return;
    }
    if (code === 'Escape' || code === 'KeyP') { g.paused = !g.paused; if (g.paused) WF.Audio.stopMusic(); else WF.Audio.startMusic(); e.preventDefault(); g.render(); return; }
    if (g.paused && code === 'KeyQ') { g.goTitle(); g.render(); return; }
    if (g.paused) { e.preventDefault(); return; }   // 暂停时不答题
    if (g.input(code)) e.preventDefault();
  }

  function clickRect(g, e) {
    const r = g.cv.getBoundingClientRect(), x = (e.clientX - r.left) * C.SCREEN_W / r.width, y = (e.clientY - r.top) * C.SCREEN_H / r.height;
    return { x, y };
  }
  function onClick(e) {
    WF.Audio.unlock();
    const g = game;
    if (g.bankLoad) { g.bankLoadInput(); g.render(); return; }
    if (g.unlockShow && g.unlockShow.length) { if (g.unlockShow[0].t > 20) g.unlockShow.shift(); g.render(); return; }
    const p0 = e._x != null ? { x: e._x, y: e._y } : clickRect(g, e);
    if (WF.touchHit && WF.touchHit(g, p0.x, p0.y)) { g.render(); return; }   // v1.8 触屏：点选项答题 / 对战暂停
    if (g.camp && g.state !== 'title') { const p = e._x != null ? { x: e._x, y: e._y } : clickRect(g, e); g.campClick(p.x, p.y); g.render(); return; }
    if (g.state === 'result') { g.startMatch(); return; }
    if (g.state !== 'title') return;
    const { x, y } = e._x != null ? { x: e._x, y: e._y } : clickRect(g, e);
    const rects = g.menuRects || [];
    const hit = WF.pickRect ? WF.pickRect(rects, x, y) : rects.find(m => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h);
    if (!hit) return;
    const sc = g.ui.screen || 'title';
    if (sc === 'title') {
      if (hit.key === 'book') g.goBook();
      else if (hit.key === 'wrongbook') g.goWrong();
      else if (hit.key === 'settings') g.goSettings();
      else if (hit.key === 'players' || hit.key === 'p1') g.goProfiles(0);
      else if (hit.key === 'p2') g.goProfiles(1);
      else { g.menu.row = hit.i >= 0 ? hit.i : g.menu.row; g.menuAct(hit.key, 1); }
    } else if (sc === 'achievements') {
      g.achClick(hit);
    } else if (sc === 'growth') {
      g.growClick(hit);
    } else if (sc === 'daily') {
      g.dailyClick(hit);
    } else if (sc === 'codex') {
      g.codexClick(hit);
    } else if (sc === 'settings') {
      if (hit.key === 'back') { g.ui.screen = 'title'; g.menu.row = 0; }
      else { g.menu.row = hit.i >= 0 ? hit.i : g.menu.row; g.menuAct(hit.key, 1); }
    } else if (sc === 'charsel') {
      if (hit.key === 'back') g.charselBack();
      else if (hit.key === 'cpu') { g.rollCpuChar(WF.CFG.ROSTER[g.ui.sel]); g.charselPreview(); WF.Audio.play('menu'); }
      else if (hit.key === 'campmode' && g.toggleCampMode) g.toggleCampMode(hit.mode);
      else if (hit.key === 'grow' && g.goGrow) g.goGrow('charsel');
      else if (hit.key === 'skin' && g.skinClick) g.skinClick(hit);   // v1.8 换外观（左半边上一个 / 右半边下一个）
      else if (hit.key === 'diff' && g.cycleDiff) g.cycleDiff(1);
      else if (hit.key === 'pick') {
        if (g.ui.sel !== hit.i) { g.ui.sel = hit.i; g.ui.deny = null; g.charselPreview(); }
        g.confirmChar();
      }
    } else if (sc === 'profiles') {
      if (g.ui.confirm) return;
      if (g.ui.sub === 'create' && hit.key === 'avatar') { g.ui.avatar = hit.i; return; }
      if (hit.key === 'pick') {
        g.ui.sel = hit.i;
        const p = WF.Profiles.list()[hit.i];
        if (p) {
          if (g.ui.side === 1) g.menu.p2 = p.id; else { g.menu.p1 = p.id; WF.Profiles.applyBgm(p.id); }
          g.persistMenu();
          if (g.ui.then === 'start') g.requestStart(g.menu.wrongMatch);
          else if (g.ui.then === 'campaign') g.requestCampaign();
          else if (g.ui.then === 'book') g.goBook();
          else if (g.ui.then === 'wrong') g.goWrong();
          else g.ui.screen = 'title';
        }
      } else if (hit.key === 'create') beginCreate(g);
      else if (hit.key === 'rename') beginRename(g);
      else if (hit.key === 'delete') beginDelete(g);
      else if (hit.key === 'back') { g.ui.screen = 'title'; }
    } else if (sc === 'book') {
      if (hit.key === 'back') { if (WF.Speech) WF.Speech.stop(); g.ui.screen = 'title'; }
      else if (hit.key === 'bank') { g.ui.bank = hit.i; g.ui.page = 0; g.ui.sel = 0; if (WF.Speech) WF.Speech.stop(); }
      else if (hit.key === 'prev') { g.ui.page = Math.max(0, g.ui.page - 1); g.ui.sel = 0; if (WF.Speech) WF.Speech.stop(); }
      else if (hit.key === 'next') { g.ui.page++; g.ui.sel = 0; if (WF.Speech) WF.Speech.stop(); }
      else if (hit.key === 'search') startText(g.ui.query || '', 40);
      else if (hit.key === 'pick-entry') g.ui.sel = hit.i;
      else if (hit.key === 'say-word' || hit.key === 'say-ex') {
        g.ui.sel = hit.i;
        const e = bookSlice(g)[hit.i];
        g.speakEntry(e, hit.key === 'say-ex' ? 'ex' : 'word');
      }
    } else if (sc === 'wrongbook') {
      if (hit.key === 'back') { if (WF.Speech) WF.Speech.stop(); g.ui.screen = 'title'; }
      else if (hit.key === 'filter') { g.ui.bankFilter = hit.id; g.ui.page = 0; g.ui.sel = 0; if (WF.Speech) WF.Speech.stop(); }
      else if (hit.key === 'prev') { g.ui.page = Math.max(0, g.ui.page - 1); g.ui.sel = 0; if (WF.Speech) WF.Speech.stop(); }
      else if (hit.key === 'next') { g.ui.page++; g.ui.sel = 0; if (WF.Speech) WF.Speech.stop(); }
      else if (hit.key === 'wrongfight') g.requestStart(true);
      else if (hit.key === 'pick-entry') g.ui.sel = hit.i;
      else if (hit.key === 'say-word' || hit.key === 'say-ex') {
        g.ui.sel = hit.i;
        const e = g.enrichEntry(wrongSlice(g)[hit.i]);
        g.speakEntry(e, hit.key === 'say-ex' ? 'ex' : 'word');
      }
    }
    g.render();
  }

  function boot() {
    const cv = document.getElementById('game');
    if (!window.WF_ASSETS || !window.WF_BANKS) { document.body.innerHTML += '<p style="color:#fff">资源没加载到：请确认 assets/assets.js 和 data/banks.js 存在。</p>'; return; }
    WF.Stage.build();
    if (WF.Run && WF.Run.preloadAll) WF.Run.preloadAll();
    WF.Sprites.load(() => {
      game = new WF.Game(cv); WF.game = game;
      window.addEventListener('keydown', onKey);
      cv.addEventListener('mousedown', onClick);
      cv.addEventListener('touchstart', (e) => {   // v1.8 触屏：直接换算坐标走同一个点击入口，并挡掉浏览器补发的鼠标事件
        e.preventDefault(); const t = e.changedTouches[0], r = cv.getBoundingClientRect();
        onClick({ _x: (t.clientX - r.left) * C.SCREEN_W / r.width, _y: (t.clientY - r.top) * C.SCREEN_H / r.height });
      }, { passive: false });
      cv.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
      if (game.bankBoot) game.bankBoot();   // v1.8 存档里选的是按需词库 → 后台预下载
      game.render();
      requestAnimationFrame(frame);
      WF.ready = true;
    });
  }
  // ---- 测试 / 录屏钩子 ----
  WF.setManual = (v) => { manual = !!v; acc = 0; last = 0; };
  WF.step = (n = 1, render = true) => { for (let i = 0; i < n; i++) game.update(); if (render) game.render(); };
  WF.key = (code) => onKey({ code, repeat: false, preventDefault() {} });
  WF.seed = (s) => { game.rnd = WF.rng(s); };
  WF.clickAt = (x, y) => onClick({ clientX: 0, clientY: 0, /* patched below */ _x: x, _y: y });
  window.addEventListener('load', boot);
})();
