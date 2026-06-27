# 今生我要修成仙

文字修真 + 放置挂机 H5 游戏。

## 部署

- 本地开发：`npm run dev`
- 普通构建：`npm run build`
- GitHub Pages 构建：`npm run build:github`

GitHub Pages 只托管静态前端。服务端存档 API 当前指向 Cloudflare Worker：

`https://xiuxian-game.open-brain-a0a.workers.dev`

玩家存档仍由服务端 Upstash KV 保存。
