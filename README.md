# 🥢 食神签 — 野生食神的日常审判

让「食神」帮你决定今天吃什么，附带毒舌点评。支持 Web + 手机 App。

## ☁️ 部署到云端（推荐，手机 App 直接连）

### Railway（最简单，免费）

1. Fork 本项目到 GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. 添加 Volume：路径 `/app/data`，1GB
4. 可选：添加环境变量 `AI_API_KEY` 开启 AI 神谕
5. 部署完成 → 获得 URL → 填入手机 App ✅

### VPS / Docker

```bash
git clone <repo> && cd 食神签
docker compose up -d
# 确保防火墙开放 3456 端口
```

## 🚀 本地运行

```bash
npm install
npm start
# http://localhost:3456/食神签.html
```

## 📱 手机 App

- 基于 Capacitor 封装，生成 Android APK
- 首次启动填入云端服务器地址即可
- 详细构建说明见 [食神签4.md](食神签4.md)

## ⚙️ 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 端口 | `3456` |
| `DB_PATH` | 数据库路径 | `./food_oracle.db` |
| `AI_PROVIDER` | AI：groq/gemini/siliconflow/deepseek | `groq` |
| `AI_API_KEY` | AI 密钥 | (空) |

## 功能

- 📜 抽签决定吃啥 — 点击/摇晃签筒
- 🔮 AI 神谕 — AI 食神毒舌点评（Key 不暴露给前端）
- 📝 记仇本 — SQLite 持久化
- 🌙 深夜模式 — 23:00~5:00 鬼食风格
- 😡 食神心情 — 每天随机（平和/暴躁/emo/中二病/罢工）
- 📊 多用户统计

## 技术栈

- 后端：Node.js + Express + better-sqlite3
- 前端：纯 HTML/CSS/JS（零框架）
- 手机端：Capacitor → Android APK
- 部署：Docker / Railway / 任意 VPS
