// 精英和城市共用的战利品机。错题激活在本局有效，付费摇奖独立于战利品翻牌。
WF.LootReview = (() => {
  const reels = WF.LootReels;
  const { PRICE, ACTIVATION_WORDS, GOLD_PAYTABLE } = WF.CFG.CAMPAIGN.LOOT_MACHINE;
  const totalWeight = GOLD_PAYTABLE.reduce((total, [, weight]) => total + weight, 0);
  const maxPrize = Math.max(...GOLD_PAYTABLE.map(([gold]) => gold));
  const rtp = GOLD_PAYTABLE.reduce((total, [gold, weight]) => total + gold * weight, 0) / (PRICE * totalWeight);
  const priceFor = cp => WF.R19.lootPrice(cp.lootSpinN || 0);
  const action = { x: 140, y: 462, w: 312, h: 66, key: 'machine' };
  const leave = { x: 507, y: 462, w: 312, h: 66, key: 'leave' };
  const back = { x: 718, y: 42, w: 176, h: 64, key: 'back' };
  const next = { x: 325, y: 445, w: 310, h: 69, key: 'next' };
  const startButton = { ...action, key: 'start' };
  const pauseButton = { ...leave, key: 'pauseMachine' };
  const exitMachine = { x: 56, y: 8, w: 181, h: 64, key: 'leave' };

  function button(g, rect, label, enabled = true) {
    WF.Buttons.plate(g, rect, enabled ? 'focus' : 'disabled', false, 'arcade');
    g.txt(label, rect.x + rect.w / 2, rect.y + rect.h / 2, 20, enabled ? '#fff0c7' : '#d0c4b6', 'center', { maxW: rect.w - 22 });
    if (enabled) g.campRects.push(rect);
  }

  function wrongWords(g, m) {
    return m.activationPool ??= WF.Profiles.wrongList(g.menu.p1, 'all').filter(
      (entry) => entry.kind !== 'phrase' && entry.word && g.banks.some((bank) => bank.id === entry.bank && bank.words.length)
    );
  }

  function prepare(g, m) {
    const pid = g.menu.p1;
    const rng = g.campRng('lootWords' + g.camp.flipN);
    const selection = WF.R19.reviewWords(rng, wrongWords(g, m), [], [], ACTIVATION_WORDS);
    if (!selection.ok) return null;
    const quizzes = new Map();
    const queue = selection.words.map((entry, i) => {
      const b = g.banks.find(bank => bank.id === entry.bank);
      if (!quizzes.has(b.id)) quizzes.set(b.id, new WF.Quiz(b, rng));
      const word = b.words.find((w) => w.word === entry.word) || entry;
      const senses = entry.wrongSenses || [];
      return {
        word,
        bank: b.id,
        quiz: quizzes.get(b.id),
        sense: senses.length ? senses[Math.floor(rng() * senses.length)] : entry.senseId,
        reverse: i % 2 === 1
      };
    });
    return { pid, queue, count: 0, picked: null, sel: 0 };
  }

  function ask(review) {
    const item = review.queue[0];
    const q = item.quiz.build(item.word, item.sense, item.reverse);
    review.question = Object.assign(q, { bank: item.bank, kind: 'word', fromWrongBook: true });
    review.picked = null;
    review.sel = 0;
    WF.Profiles.markSeen(review.pid, q);
  }

  function open(g, m) {
    if (g.camp.lootActivated) {
      m.machine = makeMachine(g);
      return;
    }
    m.review = m.review || prepare(g, m);
    if (!m.review) return;
    if (!m.review.question) ask(m.review);
    m.inReview = true;
  }

  function answer(r, index) {
    const q = r.question;
    if (r.picked != null || !Number.isInteger(index) || index < 0 || index >= q.options.length) return;
    const ok = index === q.correct;
    r.picked = index;
    WF.Profiles.markAnswer(r.pid, q, ok);
    WF.Audio.play(ok ? 'correct' : 'wrong');
    if (ok) {
      r.count++;
      WF.Haptics.correct();
    } else WF.Haptics.wrong();
  }

  function advance(g, m) {
    const r = m.review,
      q = r.question;
    if (r.picked == null) return;
    const item = r.queue.shift();
    if (r.picked !== q.correct) {
      item.reverse = q.fmt !== 'zh-en';
      item.sense = q.senseId;
      r.queue.push(item);
    }
    if (r.queue.length) {
      ask(r);
      return;
    }
    g.camp.lootActivated = true;
    m.inReview = false;
    m.review = null;
    g.toast('战利品机已激活', `首摇 ${PRICE} 金币，后续每次翻倍`);
    WF.Audio.play('confirm');
  }

  function makeMachine(g) {
    const cp = g.camp;
    const price = priceFor(cp);
    const serial = (cp.lootSpinN || 0) + 1;
    const rng = g.campRng('lootMachine' + serial);
    const tiles = WF.R19.makeLootMachineBoard(rng, price);
    const slot = WF.R19.pickLootSlot(rng, tiles);
    const won = tiles[slot];
    const jackpot = won.gold === maxPrize * (price / PRICE);
    const strip = [won, ...tiles.filter(card => card !== won).slice(0, 3)];
    const sprite = (card, x, y, size, onRing) => {
      const color = card.gold === maxPrize * (price / PRICE) ? '#ffda67' : '#ffe7ba';
      g.txt('+' + card.gold, x, y - (onRing ? 8 : 0), size * 0.60, color, 'center', { sw: 4, weight: 900, maxW: size * 1.65 });
      if (onRing) g.txt((100 * card.weight / totalWeight).toFixed(1) + '%', x, y + 12, 13, '#e6d8bc', 'center', { sw: 3 });
    };
    const destinations = [0, 0, 0];
    const draw = reels.create(g.ctx, tiles, strip, destinations, sprite);
    return {
      stage: 'ready', paused: false, frame: 0, time: 0, settled: false,
      price, serial, slot, won, jackpot, draw,
      gear: jackpot ? reels.gearTicks(strip.length, destinations) : [],
      nextGear: 0
    };
  }

  function start(g, m) {
    const cp = g.camp;
    const current = m.machine;
    if (current.stage === 'spin') {
      current.paused = false;
      return;
    }
    if (!cp.lootActivated || cp.gold < priceFor(cp)) return;
    const round = current.stage === 'ready' ? current : makeMachine(g);
    if (!g.spendGold(round.price, '战利品摇奖机')) return;
    cp.lootSpinN = round.serial;
    round.stage = 'spin';
    m.machine = round;
    WF.Audio.play('whoosh');
  }

  function land(g, m) {
    const r = m.machine;
    if (r.settled) return;
    r.settled = true;
    g.addGold(r.won.gold, '摇奖机', { raw: true });
    if (r.won.gold > r.price) WF.Audio.play('pickup', { rare: r.jackpot });
    else WF.Audio.play('beep', { f: 310, d: 0.06 });
  }
  function finish(g, m) {
    const r = m.machine;
    land(g, m);
    r.time = r.jackpot ? reels.finishAt : reels.outerEnd;
    r.stage = 'done';
  }

  function tick(g, m) {
    const r = m.machine;
    if (r?.stage !== 'spin' || r.paused) return;
    const prev = r.time;
    r.time = (++r.frame * 1000) / WF.CFG.FPS;
    const crossed = (at) => prev < at && r.time >= at;
    if (r.time < reels.outerEnd && reels.stepAt.some(crossed)) WF.Audio.play('beep', { f: 390, d: 0.02 });
    if (crossed(reels.outerEnd)) {
      land(g, m);
      WF.Haptics.pulse('loot', r.jackpot ? [20, 45, 38] : 20, 2);
      if (!r.jackpot) {
        finish(g, m);
        return;
      }
      WF.Audio.play('rating', { big: true });
    }
    while (r.nextGear < r.gear.length && r.gear[r.nextGear].at <= r.time) {
      const { axis } = r.gear[r.nextGear++];
      WF.Audio.play('reelGear', { axis });
    }
    for (const [i, at] of reels.stopsAt.entries())
      if (crossed(at)) {
        WF.Audio.play('reelLock', { axis: i });
        WF.Haptics.pulse('reel', [12, 18, 34][i], 2);
      }
    if (r.time >= reels.finishAt) finish(g, m);
  }

  function leaveMachine(g, m) {
    m.machine = null;
    if (m.pick != null) g.flipClose();
  }

  function key(g, m, code) {
    const ok = /^(Enter|NumpadEnter|Space)$/.test(code);
    const machine = m.machine;
    if (machine) {
      if (ok || code === 'KeyR') start(g, m);
      else if (machine.stage === 'spin') {
        if (code === 'KeyP' || code === 'Escape') machine.paused = true;
      } else if (code === 'Escape') leaveMachine(g, m);
      return;
    }
    const r = m.review;
    if (code === 'Escape') {
      m.inReview = false;
      return;
    }
    if (r.picked != null) {
      if (ok) advance(g, m);
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(code);
    if (digit || ok) answer(r, digit ? Number(digit[1]) - 1 : r.sel);
    else {
      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[code];
      if (delta) r.sel = (r.sel + delta + 4) % 4;
    }
  }
  function click(g, m, hit) {
    if (!hit) return;
    if (m.machine) {
      if (hit.key === 'start') start(g, m);
      else if (m.machine.stage === 'spin') {
        if (hit.key === 'pauseMachine') m.machine.paused = true;
      } else if (hit.key === 'leave') leaveMachine(g, m);
      return;
    }
    if (hit.key === 'back') m.inReview = false;
    if (hit.key === 'answer') answer(m.review, hit.i);
    if (hit.key === 'next') advance(g, m);
  }

  function drawEntry(g, m) {
    if (g.camp.lootActivated) button(g, action, '打开奖机  R');
    else {
      const count = new Set(wrongWords(g, m).map(entry => entry.word)).size;
      const enough = count >= ACTIVATION_WORDS;
      button(g, action, enough ? `答 ${ACTIVATION_WORDS} 个错词激活  R` : `错题本 ${count} / ${ACTIVATION_WORDS} · 未激活`, enough);
    }
    if (m.pick != null) button(g, leave, '继续闯关');
  }

  function drawMachine(g, m) {
    const r = m.machine;
    const spinning = r.stage === 'spin';
    const price = priceFor(g.camp);
    const enough = g.camp.gold >= price;
    r.draw(r.time, r.stage === 'ready' ? -1 : r.slot, r.stage !== 'ready' && r.jackpot);
    g.txt('金币摇奖机', 480, 40, 30, '#ffe1a5', 'center', { sw: 5 });
    g.box(721, 22, 181, 36, '#422a25', '#a67e4d', 2);
    g.txt(`余额 ${g.camp.gold} 金币`, 811, 40, 17, '#ffdf93', 'center', { maxW: 164 });
    if (!spinning) {
      g.box(56, 22, 181, 36, '#422a25', '#a67e4d', 2);
      g.txt(m.pick == null ? '返回免费翻牌  Esc' : '继续闯关  Esc', 146, 40, 17, '#ffe1a5', 'center', { maxW: 164 });
      g.campRects.push(exitMachine);
    }
    let result = '请选择启动';
    if (r.settled) {
      const net = r.won.gold - r.price;
      const delta = net > 0 ? `净赚 ${net}` : net < 0 ? `净亏 ${-net}` : '回本';
      result = `返还 ${r.won.gold} 金币 · ${delta}`;
    }
    else if (spinning) result = '外圈跑灯';
    if (r.paused) result = '已暂停';
    g.txt(result, 480, 335, 20, '#ffdf93', 'center', { maxW: 385 });
    const startLabel = spinning ? (r.paused ? '继续转动  R' : '转动中') : `启动 · ${price} 金币  R`;
    button(g, startButton, startLabel, spinning ? r.paused : enough);
    button(g, pauseButton, '暂停  P', spinning && !r.paused);
    const caption = !spinning && !enough ? '金币余额不足' : `理论返还率 ${(100 * rtp).toFixed(1)}%`;
    g.txt(caption, 480, 443, 17, '#ffe1a5', 'center', { sw: 4 });
  }

  function draw(g, m) {
    if (m.machine) return drawMachine(g, m);
    const r = m.review, c = g.ctx;
    g.campDim(0.92);
    const q = r.question,
      answered = r.picked != null;
    g.box(35, 24, 890, 503, '#203831', '#c09559', 4);
    g.txt(`错题激活  ${r.count} / ${ACTIVATION_WORDS}`, 82, 72, 22, '#ffe1a5', 'left');
    button(g, back, '返回  Esc');
    for (let i = 0; i < ACTIVATION_WORDS; i++) {
      c.fillStyle = i < r.count ? '#ffda77' : '#655741';
      c.beginPath();
      c.arc(480 + 34 * (i - (ACTIVATION_WORDS - 1) / 2), 71, 10, 0, Math.PI * 2);
      c.fill();
    }
    g.txt(q.displayWord || q.word, 480, 152, 48, '#fff0c7', 'center', { maxW: 788 });
    q.options.forEach((label, i) => {
      const rect = { x: 95 + (i % 2) * 397, y: 215 + Math.floor(i / 2) * 87, w: 372, h: 73, key: 'answer', i };
      const tone = answered ? WF.Buttons.resultTone(i, r.picked, q.correct) : r.sel === i ? 'focus' : 'idle';
      WF.Buttons.answer(g, rect, label, { tone, pressed: r.picked === i, wrap: true });
      if (!answered) g.campRects.push(rect);
    });
    const feedback = answered
      ? q.word + ' · ' + q.meaning + '　' + (r.picked === q.correct ? '✓' : '稍后再答')
      : q.fmt === 'zh-en'
        ? '选择英文单词'
        : '选择中文释义';
    g.txt(feedback, 480, 410, 19, '#ffe2a4', 'center', { maxW: 815 });
    if (answered) button(g, next, r.count === ACTIVATION_WORDS ? '激活机器' : '继续');
  }
  return { drawEntry, open, draw, tick, key, click };
})();
