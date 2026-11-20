// 首页的两道示范题使用标题画面的角色，只演示动作，不写入战绩或错题本。
WF.Guide = (() => {
  const rounds = [
    { prompt: 'apple', instruction: '选出这个词的中文意思', options: ['书本', '苹果', '雨伞', '铅笔'], correct: 1,
      hint: '想想哪一个是水果。', tip: '先答对的一方出招。' },
    { prompt: '下雨', instruction: '选出对应的英文单词', options: ['read', 'run', 'cook', 'rain'], correct: 3,
      hint: '想想哪个词和天气有关。', tip: '电脑陪练中，连续 5 次速答就能放必杀。' },
  ];

  function open(g) {
    g.ui.screen = 'guide';
    g.ui.guide = { round: 0, picked: -1 };
    const C = WF.CFG, center = g.cam + C.VIEW_W * 0.27;
    g.p[0].x = center - C.GAP / 2;
    g.p[1].x = center + C.GAP / 2;
    WF.Audio.play('confirm');
  }

  function act(g, key, i) {
    const state = g.ui.guide, round = rounds[state.round];
    if (key === 'back') {
      g.goTitle();
      g.menu.row = g.homeButtons().findIndex(b => b.key === 'guide');
    } else if (key === 'answer' && state.picked !== round.correct) {
      state.picked = i;
      if (i === round.correct) {
        WF.Audio.play('correct');
        g.p[0].play('combo_a', { onEvent: event => {
          if (event === 'hit') g.p[1].play('hit_swap');
        } });
      } else {
        WF.Audio.play('wrong');
      }
    } else if (key === 'next' && state.picked === round.correct) {
      if (state.round + 1 < rounds.length) {
        state.round++;
        state.picked = -1;
        WF.Audio.play('confirm');
      } else {
        g.menu.cpu = true;
        g.requestStart();
      }
    }
  }

  function key(g, code) {
    const i = WF.CFG.KEYS_P1[code];
    if (i != null) act(g, 'answer', i);
    else if (code === 'Escape') act(g, 'back');
    else if (['Enter', 'NumpadEnter', 'Space'].includes(code)) act(g, 'next');
  }

  function draw(g) {
    const state = g.ui.guide, round = rounds[state.round];
    const hit = state.picked === round.correct, wrong = !hit && state.picked >= 0;
    const gold = '#ffd23c', mint = '#8cf1c4', red = '#ff9398', light = '#f6f0ff', muted = '#c4bbd5';
    const line = '#65567e';
    g.menuRects = [];
    g.box(0, 0, 960, 540, 'rgba(10,7,23,0.28)');
    g.box(30, 28, 515, 484, 'rgba(18,14,32,0.96)', line);
    g.box(30, 28, 6, 75, gold);
    g.txt('新手引导', 58, 67, 31, gold, 'left', { font: WF.CFG.FONT_TITLE });
    g.txt('练习 ' + (state.round + 1) + ' / ' + rounds.length, 517, 67, 19, muted, 'right');
    g.txt(round.instruction, 59, 126, 21, muted, 'left');
    g.txt(round.prompt, 58, 179, 49, light, 'left');
    round.options.forEach((label, i) => {
      const x = 58 + (i % 2) * 234, y = 226 + Math.floor(i / 2) * 70;
      const chosen = state.picked === i, rect = { key: 'answer', i, x, y, w: 224, h: 58 };
      WF.Buttons.answer(g, rect, label, { tone: chosen ? (hit ? 'correct' : 'wrong') : 'idle', pressed: chosen, size: 23 });
      if (!hit) g.menuRects.push(rect);
    });
    const feedback = hit ? '命中！' + round.tip : wrong ? '再试一次。' + round.hint
      : WF.touch ? '点选答案就能出招。' : '按数字键 1–4，或点击答案。';
    g.txt(feedback, 58, 389, 20, hit ? mint : wrong ? red : muted, 'left', { maxW: 458 });
    if (hit) {
      const label = state.round + 1 === rounds.length ? '进入电脑陪练' : '下一题';
      WF.Buttons.plate(g, { x: 58, y: 428, w: 458, h: 57 }, 'focus');
      g.txt(label + (WF.touch ? '' : '  ↵'), 287, 457, 23, gold, 'center');
      g.menuRects.push({ key: 'next', x: 58, y: 428, w: 458, h: 57 });
    }
    WF.Buttons.plate(g, { x: 759, y: 28, w: 171, h: 52 });
    g.txt(WF.touch ? '返回主页' : '返回主页  Esc', 845, 54, 18, light);
    g.menuRects.push({ key: 'back', x: 759, y: 28, w: 171, h: 52 });
  }
  return { open, draw, key, act };
})();
