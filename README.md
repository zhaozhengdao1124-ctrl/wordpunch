# Word Punch / 单词格斗 v1.12 (test build)

Private playtest build of a pixel-fighting English vocabulary game. **Not for distribution** — please do not share this link.

Open `index.html` (or the site root) in a browser. On iPhone: Safari → Share → Add to Home Screen.

## 同 WiFi 对战

游戏里只保留「创建房间 / 输入房间号 / 加入」。**没有服务器地址输入。** GitHub Pages 只有静态网页，不能自动发现同一 WiFi 里的电脑，也不能只靠房间号配对。

### 同一台电脑上两个人

在游戏文件夹里打开终端，输入：

```bash
npm install
node server/index.js
```

电脑浏览器打开 http://127.0.0.1:8787/ 。一个窗口点「同 WiFi 对战」并创建房间，另一个窗口输入 4 位房间码加入，两边都点准备。

### 同一 WiFi 的手机

1. 电脑先连上家里的 WiFi，再运行上面的 `node server/index.js`。
2. 屏幕上会印出「同一 WiFi」地址，样子像 `http://192.168.1.8:8787/`。
3. **手机和电脑都用浏览器打开那个地址**（同源页面会自动连上对战服务）。不要在手机上打开 `127.0.0.1`，也不要用 GitHub Pages 链接对战。
4. 一人创建房间，把 4 位房间码告诉另一人；另一人输入后加入，两边都点准备。

服务默认监听 `0.0.0.0:8787`，所以同一局域网里能访问这台电脑的设备可以连上。只想给本机用时，可以改成 `HOST=127.0.0.1 node server/index.js`。换一个 WiFi，或者人不在旁边，这个地址就打不开。它不是公网。

网站上的邀请链接在本机和局域网地址下是停用的，避免被误当成可以发给外网朋友的链接。同一 WiFi 用房间码即可。

本版本只做同一 WiFi。公网对战需要你自己把 `server/index.js` 放到双方都能连上的机器并用 `wss://` 反向代理；本仓库没有代为部署，也没有公网房间。

规则：双方同一词库、同一题型、同一回合时间。血量、伤害、速答和暴击用基础数值，不带闯关成长、道具、难度或错题本。结算后双方都确认，就在原房间再战。掉线后会在限时内真的重连，超时判负。对战里不朗读单词。在线对局不写单机存档。
