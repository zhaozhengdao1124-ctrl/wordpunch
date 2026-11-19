# Word Punch / 单词格斗 v1.12 (test build)

Private playtest build of a pixel-fighting English vocabulary game. **Not for distribution** — please do not share this link.

Open `index.html` (or the site root) in a browser. On iPhone: Safari → Share → Add to Home Screen.

## 在线对战（本机）

GitHub Pages 只有静态页面，没有对战服务器。在线对战要另开一个进程，两台设备连同一台服务。

```bash
npm install
node server/index.js
```

电脑浏览器打开 http://127.0.0.1:8787/ ，进「在线对战」，创建房间。另一台浏览器（或同一台的另一个窗口）输入房间码加入，双方点准备。

当前如果页面或服务地址是 localhost / 127.0.0.1，游戏只给房间码，不会把本机链接当成公网邀请。朋友要一起玩，必须能访问你的对战服务；只把 GitHub Pages 网址发出去是不够的。

公网对战时，把 `server/index.js` 放在双方都能连上的机器，用 `wss://` 反向代理，游戏里填这个地址。本仓库没有代为部署，也没有公网房间。

规则：双方同一词库、同一题型、同一回合时间。血量、伤害、速答和暴击用基础数值，不带闯关成长、道具、难度或错题本。结算后双方都确认，就在原房间再战。掉线后会在限时内真的重连，超时判负。对战里不朗读单词。在线对局不写单机存档。
