// 小图使用与游戏道具一致的像素轮廓和有限色阶。按整数倍绘制到滚轮和奖格。
WF.LootSymbols = (() => {
  const SIZE = 20;
  const sprites = new Map();
  const P = {
    ink: '#231924', white: '#fff4ce',
    red: '#e4464d', redDark: '#a51f47', pink: '#ff8090',
    orange: '#f29331', rust: '#c85838', cream: '#ffde8c',
    yellow: '#f1bc42', pale: '#fff084', gold: '#b77734',
    lime: '#afdf49', green: '#5fbb52', moss: '#29765a', mint: '#c3f58c',
    purple: '#a068ca', plum: '#684491', lavender: '#e0a8f3',
    blue: '#4ba1cf', ocean: '#35689c', ice: '#a9e9ef', navy: '#44516c'
  };

  function leaf(b, x, y) {
    b.poly(P.green, [[x, y + 4], [x + 2, y], [x + 6, y - 1], [x + 5, y + 2], [x + 3, y + 4]]);
    b.line(P.mint, [[x + 2, y + 1], [x + 4, y]]);
  }

  const paint = {
    plum(b) {
      b.ellipse(P.plum, 10, 11, 6, 7);
      b.ellipse(P.purple, 9, 10, 5, 5);
      b.line(P.plum, [[10, 7], [12, 10], [12, 13], [11, 15]]);
      b.rect(P.lavender, 6, 8, 2, 2);
      b.rect(P.white, 6, 8, 1, 1);
      leaf(b, 9, 2);
    },
    lemon(b) {
      b.poly(P.gold, [[2, 13], [3, 10], [4, 7], [9, 5], [14, 5], [17, 7], [17, 10], [16, 13], [12, 16], [7, 16], [5, 14]]);
      b.poly(P.yellow, [[3, 12], [5, 8], [9, 6], [14, 6], [16, 8], [15, 11], [12, 14], [8, 15], [5, 13]]);
      b.line(P.pale, [[5, 10], [8, 8], [11, 7]]);
      b.rect(P.white, 7, 8, 2, 1);
      leaf(b, 12, 2);
    },
    orange(b) {
      b.ellipse(P.rust, 10, 10, 8, 8);
      b.ellipse(P.cream, 10, 9, 7, 7);
      b.ellipse(P.orange, 10, 9, 6, 6);
      for (const tip of [[10, 4], [15, 6], [15, 12], [10, 14], [5, 12], [5, 6]]) b.line(P.cream, [[10, 9], tip]);
      b.rect(P.white, 9, 8, 2, 2);
    },
    apple(b) {
      b.ellipse(P.moss, 7, 11, 5, 6);
      b.ellipse(P.moss, 12, 11, 5, 6);
      b.ellipse(P.green, 7, 10, 4, 5);
      b.ellipse(P.green, 12, 10, 4, 5);
      b.rect(P.gold, 9, 3, 2, 4);
      b.rect(P.mint, 5, 7, 2, 2);
      leaf(b, 10, 3);
    },
    pear(b) {
      b.ellipse(P.moss, 10, 13, 6, 5);
      b.ellipse(P.green, 10, 12, 5, 5);
      b.ellipse(P.lime, 10, 8, 4, 5);
      b.ellipse(P.lime, 9, 12, 4, 4);
      b.line(P.mint, [[8, 7], [7, 9], [7, 11]]);
      b.rect(P.gold, 10, 2, 1, 3);
      leaf(b, 10, 2);
    },
    strawberry(b) {
      b.poly(P.redDark, [[3, 6], [7, 4], [13, 4], [17, 6], [17, 10], [14, 14], [10, 18], [6, 14], [3, 10]]);
      b.poly(P.red, [[4, 6], [8, 5], [13, 5], [16, 6], [16, 10], [12, 14], [9, 15], [5, 11]]);
      b.poly(P.green, [[4, 4], [8, 4], [10, 2], [12, 4], [16, 4], [13, 7], [10, 6], [7, 7]]);
      for (const [x, y] of [[6, 8], [12, 8], [8, 10], [14, 10], [6, 11], [10, 13], [12, 12]]) b.rect(P.cream, x, y, 1, 1);
    },
    grapes(b) {
      b.line(P.moss, [[10, 7], [10, 4], [13, 2]]);
      for (const [x, y] of [[6, 7], [12, 7], [15, 11], [5, 12], [9, 15], [10, 10], [12, 14]]) {
        b.ellipse(P.plum, x, y, 3, 3);
        b.ellipse(P.purple, x - 1, y - 1, 2, 2);
        b.rect(P.lavender, x - 1, y - 2, 1, 1);
      }
    },
    cherries(b) {
      b.line(P.green, [[5, 12], [8, 6], [13, 3], [15, 12]]);
      b.line(P.moss, [[12, 4], [11, 8], [13, 13]]);
      leaf(b, 12, 2);
      for (const [x, y] of [[6, 13], [13, 15]]) {
        b.ellipse(P.redDark, x, y, 4, 4);
        b.ellipse(P.red, x - 1, y - 1, 3, 3);
        b.rect(P.pink, x - 2, y - 2, 2, 1);
      }
    },
    watermelon(b) {
      b.poly(P.moss, [[2, 6], [18, 6], [18, 9], [16, 14], [13, 17], [7, 17], [4, 14], [2, 9]]);
      b.poly(P.lime, [[2, 6], [18, 6], [17, 10], [15, 13], [12, 15], [8, 15], [5, 13], [3, 10]]);
      b.poly(P.red, [[2, 6], [18, 6], [16, 10], [14, 12], [12, 13], [8, 13], [6, 12], [4, 10]]);
      b.line(P.pink, [[4, 7], [16, 7]]);
      for (const [x, y] of [[6, 9], [9, 9], [12, 9], [14, 9], [8, 11], [11, 11]]) b.rect(P.redDark, x, y, 1, 1);
    },
    pineapple(b) {
      b.poly(P.moss, [[6, 8], [4, 4], [8, 5], [9, 1], [11, 1], [12, 5], [16, 4], [14, 8]]);
      b.line(P.green, [[7, 5], [9, 7], [11, 3], [11, 7]]);
      b.ellipse(P.gold, 10, 12, 6, 6);
      b.ellipse(P.yellow, 9, 11, 5, 5);
      b.line(P.orange, [[5, 10], [11, 16]]);
      b.line(P.orange, [[7, 7], [15, 14]]);
      b.line(P.orange, [[5, 14], [12, 7]]);
      b.line(P.orange, [[8, 17], [15, 10]]);
      b.rect(P.cream, 8, 9, 2, 1);
    },
    heart(b) {
      const shape = [[2, 8], [4, 4], [8, 4], [10, 6], [12, 4], [16, 4], [18, 7], [18, 10], [10, 18], [2, 10]];
      b.poly(P.redDark, shape);
      b.poly(P.red, [[3, 8], [5, 5], [8, 5], [10, 7], [13, 5], [16, 5], [17, 8], [15, 11], [9, 15], [4, 10]]);
      b.line(P.pink, [[5, 8], [6, 6], [8, 6]]);
    },
    clover(b) {
      b.line(P.moss, [[10, 9], [10, 14], [8, 18]]);
      for (const [x, y] of [[6, 6], [13, 6], [6, 12], [13, 12]]) {
        b.ellipse(P.moss, x, y, 4, 4);
        b.ellipse(P.green, x, y - 1, 3, 3);
        b.rect(P.mint, x - 1, y - 2, 2, 1);
      }
      b.rect(P.lime, 9, 8, 2, 3);
    },
    horseshoe(b) {
      b.poly(P.ocean, [[3, 3], [7, 3], [7, 6], [6, 7], [6, 11], [8, 14], [12, 14], [14, 11], [14, 7], [13, 6], [13, 3], [17, 3], [18, 10], [17, 14], [14, 17], [7, 17], [3, 14], [2, 10]]);
      b.line(P.ice, [[4, 5], [4, 10], [5, 13], [8, 15], [12, 15], [15, 13], [16, 10], [16, 5]]);
      b.rect(P.white, 4, 4, 2, 2);
      b.rect(P.white, 14, 4, 2, 2);
    },
    star(b) {
      b.poly(P.gold, [[10, 1], [12, 7], [18, 8], [14, 12], [15, 18], [10, 15], [4, 18], [5, 12], [1, 8], [7, 7]]);
      b.poly(P.yellow, [[10, 3], [12, 8], [16, 8], [12, 11], [13, 15], [10, 13], [6, 16], [7, 11], [3, 9], [8, 8]]);
      b.line(P.pale, [[8, 9], [10, 5], [10, 9], [6, 12]]);
    },
    diamond(b) {
      b.poly(P.ocean, [[2, 8], [6, 3], [14, 3], [18, 8], [10, 18]]);
      b.poly(P.blue, [[2, 8], [10, 8], [10, 17]]);
      b.poly(P.ice, [[2, 8], [6, 4], [14, 4], [18, 8]]);
      b.poly(P.blue, [[10, 8], [14, 4], [15, 8]]);
      b.line(P.white, [[5, 7], [7, 5], [9, 5]]);
      b.line(P.ice, [[10, 9], [10, 14]]);
    },
    bar(b) {
      b.rect(P.gold, 1, 5, 18, 11);
      b.rect(P.navy, 2, 6, 16, 9);
      b.line(P.cream, [[2, 6], [17, 6]]);
      const letters = [
        ['110', '101', '110', '101', '110'],
        ['010', '101', '111', '101', '101'],
        ['110', '101', '110', '101', '101']
      ];
      letters.forEach((rows, i) => rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '1') b.rect(P.white, 4 + i * 4 + x, 8 + y, 1, 1);
      }));
    },
    bell(b) {
      b.ellipse(P.gold, 10, 16, 3, 3);
      b.rect(P.cream, 9, 16, 2, 1);
      b.poly(P.gold, [[8, 3], [12, 3], [15, 6], [16, 12], [18, 14], [18, 15], [2, 15], [2, 14], [4, 12], [5, 6]]);
      b.poly(P.yellow, [[8, 4], [12, 4], [14, 6], [15, 12], [16, 13], [4, 13], [6, 10], [6, 6]]);
      b.line(P.pale, [[7, 10], [7, 7], [9, 5]]);
      b.rect(P.cream, 3, 13, 14, 1);
      b.rect(P.gold, 9, 2, 2, 2);
    },
    seven(b) {
      b.poly(P.white, [[2, 3], [18, 3], [18, 7], [14, 11], [12, 18], [5, 18], [6, 14], [11, 8], [2, 8]]);
      b.poly(P.redDark, [[3, 4], [17, 4], [17, 6], [13, 11], [11, 17], [6, 17], [7, 14], [13, 7], [3, 7]]);
      b.poly(P.red, [[3, 4], [16, 4], [16, 6], [12, 10], [10, 15], [7, 15], [12, 7], [3, 6]]);
      b.line(P.pink, [[4, 5], [12, 5]]);
    }
  };

  function makeSprite(draw) {
    const pixels = new Array(SIZE * SIZE).fill(null);
    function put(color, x, y) {
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) pixels[y * SIZE + x] = color;
    }
    const brush = {
      rect(color, left, top, width, height) {
        for (let y = top; y < top + height; y++) {
          for (let x = left; x < left + width; x++) put(color, x, y);
        }
      },
      ellipse(color, cx, cy, rx, ry) {
        for (let y = cy - ry; y <= cy + ry; y++) {
          for (let x = cx - rx; x <= cx + rx; x++) {
            if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(color, x, y);
          }
        }
      },
      poly(color, points) {
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            let inside = false;
            const py = y + 0.5, px = x + 0.5;
            let [ax, ay] = points[points.length - 1];
            for (const [bx, by] of points) {
              if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
              ax = bx;
              ay = by;
            }
            if (inside) put(color, x, y);
          }
        }
      },
      line(color, points) {
        for (let i = 1; i < points.length; i++) {
          const [x, y] = points[i - 1];
          const dx = points[i][0] - x, dy = points[i][1] - y;
          const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
          for (let j = 0; j <= steps; j++) put(color, Math.round(x + dx * j / steps), Math.round(y + dy * j / steps));
        }
      }
    };
    draw(brush);
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = SIZE;
    const surface = sprite.getContext('2d');
    const ink = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && pixels[y * SIZE + x];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const color = ink(x, y);
        const bordered = ink(x - 1, y) || ink(x + 1, y) || ink(x, y - 1) || ink(x, y + 1);
        if (color || bordered) {
          surface.fillStyle = color || P.ink;
          surface.fillRect(x, y, 1, 1);
        }
      }
    }
    return sprite;
  }

  function draw(ctx, name, x, y, size) {
    if (!sprites.has(name)) sprites.set(name, makeSprite(paint[name]));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprites.get(name), Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
  return { draw };
})();
