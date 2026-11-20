// 摇奖机赔率模拟：node tools/loot_sim.js [runs]
// 按真实规则逐次摇奖：每次重新洗牌、按权重抽奖格、判三轴（含第 12 次保底），统计触发率、大奖率和返还率（RTP）。
globalThis.window = globalThis;
require('../js/config.js'); require('../js/v19_config.js'); require('../js/v19_rules.js');
const R = WF.R19, runs = +process.argv[2] || 100000;
const rng = R.rng(20261120);
function sim(spinsPerRun) {
  let spins = 0, three = 0, jackpot = 0, paid = 0, back = 0, runsSeen = 0, pity = 0;
  for (let run = 0; run < runs; run++) {
    let seen = false;
    for (let serial = 1; serial <= spinsPerRun; serial++) {
      const price = R.lootPrice(1);
      const board = R.makeLootMachineBoard(rng, price);
      const won = board[R.pickLootSlot(rng, board)];
      const before = seen;
      const mode = R.lootReelMode(rng, board, won, { serial, seen });
      if (mode !== 'none') { three++; seen = true; }
      if (mode === 'reels' && serial === 12 && !before) pity++;
      if (mode === 'jackpot') jackpot++;
      spins++; paid += price; back += R.lootPayout(won, mode);
    }
    if (seen) runsSeen++;
  }
  return { spinsPerRun, spins, threeAxisRate: three / spins, jackpotRate: jackpot / spins, runsSeeingThreeAxis: runsSeen / runs, pityPerRun: pity / runs, rtp: back / paid };
}
const pct = x => (x * 100).toFixed(2) + '%';
for (const n of [10, 15]) {
  const r = sim(n);
  console.log(`每局 ${n} 次 × ${runs} 局（共 ${r.spins} 次）：三轴 ${pct(r.threeAxisRate)}，大奖 ${pct(r.jackpotRate)}，本局见到三轴 ${pct(r.runsSeeingThreeAxis)}，保底触发 ${pct(r.pityPerRun)} 的局，RTP ${pct(r.rtp)}`);
}
