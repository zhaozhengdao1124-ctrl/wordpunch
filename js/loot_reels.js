// 十八格共用一条灯光和音效时间线，绘制不决定奖励。
WF.LootReels = (() => {
  const stops = [
    [140, 119],
    [276, 119],
    [412, 119],
    [548, 119],
    [684, 119],
    [820, 119],
    [834, 186],
    [834, 255],
    [834, 324],
    [820, 391],
    [684, 391],
    [548, 391],
    [412, 391],
    [276, 391],
    [140, 391],
    [126, 324],
    [126, 255],
    [126, 186]
  ];
  // Both the lamps and the ratchet ticks follow these same timestamps.
  const stepAt = [0];
  for (const gap of [
    140, 118, 105, 96, 92, 90, 90, 90, 90, 90, 90, 90, 92, 96, 103, 112, 124, 139, 159, 184, 218, 258, 310, 374, 450, 540
  ]) {
    stepAt.push(stepAt[stepAt.length - 1] + gap);
  }
  const outerEnd = stepAt[stepAt.length - 1],
    rollStart = outerEnd + 420;
  const stopsAt = [2050, 2750, 3650].map((ms) => rollStart + ms);
  const finishAt = stopsAt[2] + 1150;
  const spinUp = 0.14, braking = 0.32;
  const totalTravel = braking - spinUp / 2 + (1 - braking) / 2;

  function travelAt(progress) {
    if (progress < spinUp) return progress ** 2 / (2 * spinUp);
    if (progress < braking) return progress - spinUp / 2;
    return totalTravel - (1 - progress) ** 2 / (2 * (1 - braking));
  }

  function reelDistance(axis, length, destination) {
    return length + ((destination - axis + length) % length);
  }

  // Same travel curve as the animation. One contact per quarter of a symbol.
  function gearTicks(length, destinations) {
    const ticks = [];
    destinations.forEach((destination, axis) => {
      const teeth = reelDistance(axis, length, destination) * 4;
      for (let tooth = 0; tooth < teeth; tooth++) {
        const travel = ((tooth + 0.5) / teeth) * totalTravel;
        let progress;
        if (travel < spinUp / 2) progress = Math.sqrt(2 * spinUp * travel);
        else if (travel < braking - spinUp / 2) progress = travel + spinUp / 2;
        else progress = 1 - Math.sqrt(2 * (1 - braking) * (totalTravel - travel));
        ticks.push({ at: rollStart + (stopsAt[axis] - rollStart) * progress, axis });
      }
    });
    return ticks.sort((a, b) => a.at - b.at);
  }

  function create(ctx, tiles, strip, symbols, sprite) {
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const fill = (x, y, w, h, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
    };
    function polygon(points, col) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (const [i, [x, y]] of points.entries()) {
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    function bevel(x, y, w, h, cut, color) {
      polygon(
        [
          [x + cut, y],
          [x + w - cut, y],
          [x + w, y + cut],
          [x + w, y + h - cut],
          [x + w - cut, y + h],
          [x + cut, y + h],
          [x, y + h - cut],
          [x, y + cut]
        ],
        color
      );
    }
    function grad(x, y, h, colors) {
      const gr = ctx.createLinearGradient(x, y, x, y + h);
      for (const [mark, c] of colors) gr.addColorStop(mark, c);
      return gr;
    }
    function screw(x, y) {
      ctx.beginPath();
      ctx.arc(x, y, 4.3, 0, Math.PI * 2);
      ctx.fillStyle = '#392623';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - 0.5, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#bc9968';
      ctx.fill();
      fill(x - 2, y - 0.8, 4, 1.5, '#624334');
    }
    function bulb(x, y, on) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = '#3e2d25';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 3.7, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ffdb83' : '#af8955';
      if (on) {
        ctx.shadowColor = '#ef9d2e';
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      fill(x - 1.4, y - 2, 2.4, 1.6, on ? '#fff6c9' : '#e1bc79');
      ctx.restore();
    }
    function outerIndex(t, slot) {
      const next = stepAt.findIndex((at) => at > t);
      const remaining = next < 0 ? 0 : stepAt.length - next;
      return (((slot - remaining) % stops.length) + stops.length) % stops.length;
    }
    function reelOffset(i, t) {
      const dest = symbols[i];
      const distance = reelDistance(i, strip.length, dest);
      const progress = Math.max(0, Math.min(1, (t - rollStart) / (stopsAt[i] - rollStart)));
      if (still.matches) return progress < 1 ? i : dest;
      const seat = Math.min(1, Math.max(0, (t - stopsAt[i]) / 145));
      return i + (distance * travelAt(progress)) / totalTravel + 0.05 * Math.sin(Math.PI * seat) * (1 - seat);
    }
    function makeCloth() {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 128;
      const texture = tile.getContext('2d');
      const pixels = texture.createImageData(tile.width, tile.height);
      let seed = 47;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const fiber = (i / 4) % 3 === 0 ? 6 : 0;
        const tone = seed >>> 24;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = tone > 127 ? 229 : 12;
        pixels.data[i + 3] = Math.abs(tone - 127) / 5 + fiber;
      }
      texture.putImageData(pixels, 0, 0);
      return ctx.createPattern(tile, 'repeat');
    }
    const cloth = makeCloth();
    function roundedPath(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function table() {
      const rail = grad(0, 68, 374, [[0, '#655045'], [0.08, '#302621'], [0.49, '#382b27'], [0.94, '#2a211d'], [1, '#4a3730']]);
      const felt = ctx.createRadialGradient(425, 199, 30, 478, 246, 462);
      felt.addColorStop(0, '#247b56');
      felt.addColorStop(0.6, '#176347');
      felt.addColorStop(1, '#0e3b30');
      roundedPath(45, 68, 870, 375, 53);
      ctx.fillStyle = '#211b19';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#b58a57';
      ctx.stroke();
      roundedPath(48, 71, 864, 369, 50);
      ctx.fillStyle = rail;
      ctx.fill();
      roundedPath(56, 78, 848, 353, 46);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = '#b89368a1';
      ctx.stroke();
      ctx.setLineDash([]);
      roundedPath(65, 86, 830, 337, 40);
      ctx.fillStyle = felt;
      ctx.fill();
      if (cloth) {
        ctx.fillStyle = cloth;
        ctx.fill();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#092720';
      ctx.stroke();
      // The curved betting line on the felt follows the shape of the padded rail.
      roundedPath(174, 148, 612, 214, 98);
      ctx.lineWidth = 1.75;
      ctx.strokeStyle = '#b9d7a359';
      ctx.stroke();
    }
    function shell(t, selected, legend) {
      const gold = legend && t >= outerEnd;
      fill(0, 0, 960, 540, '#21191e');
      bevel(7, 6, 946, 526, 20, '#3b2527');
      bevel(12, 10, 936, 515, 18, '#a77d4c');
      bevel(
        16,
        14,
        928,
        505,
        17,
        grad(0, 14, 505, [
          [0, '#703931'],
          [0.24, '#522a2f'],
          [0.81, '#43232a'],
          [1, '#70392f']
        ])
      );
      for (let k = 0; k < 96; k++) {
        const x = 26 + ((k * 173) % 900),
          y = 19 + ((k * 67) % 483);
        fill(x, y, 4 + (k % 7), 1, '#ffd1900c');
      }
      bevel(304, 18, 352, 47, 13, '#392522');
      bevel(
        306,
        19,
        348,
        44,
        12,
        grad(0, 19, 44, [
          [0, '#e1b774'],
          [0.17, '#a17445'],
          [0.9, '#794c35'],
          [1, '#b58b55']
        ])
      );
      bevel(
        309,
        22,
        342,
        38,
        10,
        grad(0, 22, 38, [
          [0, '#713e35'],
          [0.45, '#49272b'],
          [1, '#331f25']
        ])
      );
      for (const x of [326, 634]) {
        bulb(x, 41, gold);
      }
      for (const y of [38, 46, 54]) {
        fill(62, y, 187 - (y - 38) * 3, 2, '#b07a4d');
        fill(711 + (y - 38) * 3, y, 187 - (y - 38) * 3, 2, '#b07a4d');
      }
      for (const [x, y] of [
        [33, 32],
        [927, 32],
        [33, 506],
        [927, 506]
      ])
        screw(x, y);
      table();
      for (const x of [68, 790]) {
        for (let j = 0; j < 5; j++) {
          const w = 78 - Math.abs(2 - j) * 9;
          fill(x + (78 - w) / 2, 462 + j * 6, w, 3, '#351f22');
          fill(x + (78 - w) / 2, 465 + j * 6, w, 1, '#9b6950');
        }
      }
      ctx.strokeStyle = '#816b44';
      ctx.lineWidth = 4;
      ctx.beginPath();
      stops.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      stops.forEach(([x, y], i) => {
        const next = stops[(i + 1) % stops.length];
        const age = (selected - i + stops.length) % stops.length;
        const lamps = i < 5 || (i >= 9 && i < 14) ? 6 : 4;
        for (let j = 1; j < lamps; j++) {
          const f = j / lamps,
            dx = x + (next[0] - x) * f,
            dy = y + (next[1] - y) * f;
          const light = (selected >= 0 && t < outerEnd && !still.matches && age < 2) || gold;
          ctx.beginPath();
          ctx.arc(dx, dy, 4.1, 0, Math.PI * 2);
          ctx.fillStyle = light ? (age === 0 ? '#ffda88' : '#b78c53') : '#927651';
          ctx.shadowColor = light ? '#ecae51' : 'transparent';
          ctx.shadowBlur = light && age === 0 ? 7 : 0;
          ctx.fill();
          ctx.shadowBlur = 0;
          fill(dx - 1.3, dy - 2, 2, 2, light ? '#fff2bf' : '#c0a278');
        }
        const active = selected === i;
        const outer = active ? (gold ? '#ffdc71' : '#ffe4ab') : '#a1865d';
        bevel(x - 45, y - 29, 90, 58, 9, '#172321');
        if (active) {
          ctx.shadowColor = '#ffbe48';
          ctx.shadowBlur = 15;
        }
        bevel(x - 43, y - 28, 86, 54, 8, outer);
        ctx.shadowBlur = 0;
        bevel(x - 39, y - 24, 78, 46, 6, active ? '#95552b' : '#352e2c');
        sprite(tiles[i], x, y - 1, 40);
        if (active) {
          fill(x - 20, y + 20, 40, 3, '#fff1ae');
        }
      });
      bevel(249, 160, 462, 201, 16, '#0e201e');
      bevel(
        254,
        164,
        452,
        193,
        14,
        grad(0, 164, 193, [
          [0, '#f9d595'],
          [0.12, '#b78b57'],
          [0.55, '#91643f'],
          [0.9, '#cda360'],
          [1, '#f0c983']
        ])
      );
      bevel(
        258,
        168,
        444,
        185,
        12,
        grad(0, 168, 185, [
          [0, '#4c3e34'],
          [0.24, '#332e2b'],
          [0.82, '#2e2828'],
          [1, '#46362f']
        ])
      );
      fill(282, 322, 396, 28, '#251e1e');
      fill(283, 350, 394, 1, '#685039');
      for (const sx of [265, 695]) {
        screw(sx, 181);
        screw(sx, 338);
      }
      const spin = legend && t >= rollStart;
      for (let i = 0; i < 3; i++) {
        const x = 283 + 137 * i;
        bevel(x, 184, 120, 128, 9, '#756452');
        bevel(x + 3, 187, 114, 122, 7, '#201d1d');
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 7, 191, 106, 114);
        ctx.clip();
        fill(
          x + 7,
          191,
          106,
          114,
          grad(0, 191, 114, [
            [0, '#685948'],
            [0.19, '#c4ac80'],
            [0.44, '#f9e4b0'],
            [0.57, '#fff0c9'],
            [0.82, '#c8b48a'],
            [1, '#796f5b']
          ])
        );
        const off = spin ? reelOffset(i, t) : i;
        for (let n = Math.floor(off) - 1; n <= Math.floor(off) + 1; n++) {
          const cy = 248 + (n - off) * 76;
          const sym = strip[((n % strip.length) + strip.length) % strip.length];
          sprite(sym, x + 60, cy, 60);
        }
        const sides = ctx.createLinearGradient(x + 7, 0, x + 113, 0);
        sides.addColorStop(0, '#4d352840');
        sides.addColorStop(0.08, '#fff1ba08');
        sides.addColorStop(0.88, '#fff1ba08');
        sides.addColorStop(1, '#4d352845');
        fill(x + 7, 191, 106, 114, sides);
        fill(x + 7, 191, 106, 4, '#453d32');
        fill(x + 7, 302, 106, 3, '#544a3f');
        ctx.restore();
        if (spin && t >= stopsAt[i]) fill(x + 35, 315, 50, 3, '#f2c96b');
      }
      polygon(
        [
          [265, 239],
          [278, 248],
          [265, 257]
        ],
        '#da654c'
      );
      polygon(
        [
          [695, 239],
          [682, 248],
          [695, 257]
        ],
        '#da654c'
      );
      for (const x of [34, 926]) {
        for (let y = 84; y <= 452; y += 46) bulb(x, y, gold);
      }
    }
    function celebration(t, slot, legend) {
      const finale = t >= stopsAt[2];
      const p = (t - (finale ? stopsAt[2] : outerEnd)) / (finale ? 1150 : 1000);
      if (!legend || still.matches || p < 0 || p >= 1) return 0;
      const pulse = Math.sin((Math.PI * Math.min(1, p / 0.24)) / 2) * Math.pow(1 - p, 1.15);
      const [cx, cy] = finale ? [480, 248] : stops[slot];
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = pulse * (finale ? 0.53 : 0.43);
      fill(0, 0, 960, 540, '#c77623');
      const bloom = ctx.createRadialGradient(cx, cy, 8, cx, cy, 750);
      bloom.addColorStop(0, '#ffdb87');
      bloom.addColorStop(0.35, '#d18138');
      bloom.addColorStop(1, '#150b06');
      fill(0, 0, 960, 540, bloom);
      ctx.globalAlpha = 0.35 * pulse;
      for (let j = 0; j < 16; j++) {
        const a = (j * Math.PI) / 8 + p * 0.12,
          half = 0.018 + (j % 3) * 0.012;
        polygon(
          [
            [cx, cy],
            [cx + 1180 * Math.cos(a - half), cy + 1180 * Math.sin(a - half)],
            [cx + 1180 * Math.cos(a + half), cy + 1180 * Math.sin(a + half)]
          ],
          '#ffcf7c'
        );
      }
      // A single expanding light wave crosses every edge of the cabinet.
      const radius = 18 + 1000 * (1 - (1 - p) ** 1.6);
      const wave = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      wave.addColorStop(0, '#f5aa3b00');
      wave.addColorStop(0.8, '#f5aa3b00');
      wave.addColorStop(0.94, '#ffd48d');
      wave.addColorStop(1, '#f5aa3b00');
      ctx.globalAlpha = pulse * 0.78;
      fill(0, 0, 960, 540, wave);
      ctx.globalAlpha = Math.sin(Math.PI * p);
      for (let j = 0; j < 40; j++) {
        const a = j * 2.39996,
          r = (48 + ((j * 137) % 580)) * (0.18 + p);
        const x = cx + Math.cos(a) * r * 1.5,
          y = cy + Math.sin(a) * r * 0.82 + 68 * p * p;
        const s = 2 + (j % 4);
        fill(x - s, y - 1, s * 2, 2, '#ffdc8b');
        fill(x - 1, y - s, 2, s * 2, '#fff1c1');
      }
      ctx.restore();
      return pulse * 0.88;
    }
    return function draw(t, slot, legend) {
      const selected = slot < 0 || (still.matches && t < outerEnd) ? -1 : outerIndex(t, slot);
      ctx.save();
      shell(t, selected, legend);
      const glow = celebration(t, slot, legend);
      ctx.restore();
      return glow;
    };
  }
  return { create, gearTicks, stepAt, outerEnd, rollStart, stopsAt, finishAt };
})();
