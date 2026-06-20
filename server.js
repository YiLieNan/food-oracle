/* ============================================
   食神签 · 后端服务器 + SQLite 数据库
   零配置运行：npm install && node server.js
   ============================================ */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'food_oracle.db');

// ── AI 配置（环境变量）───────────────────
const AI_PROVIDER = process.env.AI_PROVIDER || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'llama-3.1-8b-instant';

// ── AI 提供商配置 ─────────────────────────
const AI_PROVIDERS = {
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.1-8b-instant',
    format: 'openai'
  },
  gemini: {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
    defaultModel: 'gemini-2.0-flash',
    format: 'gemini'
  },
  siliconflow: {
    name: '硅基流动',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    format: 'openai'
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    format: 'openai'
  }
};

// ── AI 调用函数 ───────────────────────────
async function callAI(providerKey, model, apiKey, systemPrompt, userPrompt) {
  const provider = AI_PROVIDERS[providerKey];
  if (!provider) throw new Error(`未知的 AI 提供商: ${providerKey}`);

  if (provider.format === 'openai') {
    const resp = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 400,
        temperature: 0.9
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 返回 ${resp.status}: ${err.substring(0, 100)}`);
    }
    const data = await resp.json();
    return data.choices[0].message.content.trim();
  }

  if (provider.format === 'gemini') {
    const url = `${provider.endpoint}${model}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.9 }
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gemini 返回 ${resp.status}: ${err.substring(0, 100)}`);
    }
    const data = await resp.json();
    return data.candidates[0].content.parts[0].text.trim();
  }

  throw new Error(`不支持的 API 格式: ${provider.format}`);
}

// ── Middleware ────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Database Init ─────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id              TEXT PRIMARY KEY,
      nickname        TEXT,
      first_visit_at  TEXT NOT NULL DEFAULT (datetime('now')),
      last_visit_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_visit_date TEXT,
      consecutive_days INTEGER NOT NULL DEFAULT 1,
      total_draws     INTEGER NOT NULL DEFAULT 0,
      total_sins      INTEGER NOT NULL DEFAULT 0,
      poison_unlocked INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS draws (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id    TEXT NOT NULL,
      food_id       TEXT NOT NULL,
      food_name     TEXT NOT NULL,
      food_icon     TEXT NOT NULL,
      food_category TEXT,
      time_period   TEXT NOT NULL,
      mood          TEXT NOT NULL,
      accepted      INTEGER NOT NULL DEFAULT 1,
      drawn_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    );
    CREATE INDEX IF NOT EXISTS idx_draws_visitor ON draws(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_draws_date ON draws(drawn_at);

    CREATE TABLE IF NOT EXISTS daily_stats (
      date            TEXT PRIMARY KEY,
      total_visits    INTEGER NOT NULL DEFAULT 0,
      total_draws     INTEGER NOT NULL DEFAULT 0,
      total_sins      INTEGER NOT NULL DEFAULT 0,
      unique_visitors INTEGER NOT NULL DEFAULT 0,
      most_drawn_food TEXT,
      mood            TEXT,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_wars (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_date  TEXT NOT NULL,
      event_name  TEXT NOT NULL,
      faction_a   TEXT NOT NULL,
      faction_b   TEXT NOT NULL,
      score_a     INTEGER NOT NULL DEFAULT 0,
      score_b     INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS war_votes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      war_id     INTEGER NOT NULL,
      visitor_id TEXT NOT NULL,
      faction    TEXT NOT NULL,
      voted_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (war_id) REFERENCES food_wars(id),
      UNIQUE(war_id, visitor_id)
    );
  `);

  console.log('✅ 数据库初始化完成');
}

// ── Helper ────────────────────────────────
function updateDailyStats(visitorId, isDraw, isSin, foodName) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM daily_stats WHERE date = ?').get(today);

  if (existing) {
    const newDraws = existing.total_draws + (isDraw ? 1 : 0);
    const newSins = existing.total_sins + (isSin ? 1 : 0);

    let mostDrawn = existing.most_drawn_food;
    if (isDraw && foodName) {
      const max = db.prepare(`
        SELECT food_name, COUNT(*) as cnt FROM draws
        WHERE date(drawn_at) = ?
        GROUP BY food_name ORDER BY cnt DESC LIMIT 1
      `).get(today);
      if (max) mostDrawn = max.food_name;
    }

    db.prepare(`
      UPDATE daily_stats
      SET total_draws = ?, total_sins = ?, most_drawn_food = ?, updated_at = datetime('now')
      WHERE date = ?
    `).run(newDraws, newSins, mostDrawn, today);
  } else {
    db.prepare(`
      INSERT INTO daily_stats (date, total_visits, total_draws, total_sins, unique_visitors, most_drawn_food)
      VALUES (?, 1, ?, ?, 1, ?)
    `).run(today, isDraw ? 1 : 0, isSin ? 1 : 0, isDraw ? foodName : null);
  }
}

// ═══════════════════════════════════════════
//  API
// ═══════════════════════════════════════════

// 1. 访客签到
app.post('/api/visitor/checkin', (req, res) => {
  const { visitorId, nickname } = req.body;
  if (!visitorId) return res.status(400).json({ error: '缺少 visitorId' });

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  let visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(visitorId);

  if (!visitor) {
    db.prepare(`
      INSERT INTO visitors (id, nickname, first_visit_at, last_visit_at, last_visit_date, consecutive_days)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(visitorId, nickname || null, now, now, today);
    visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(visitorId);
  } else {
    let consecutiveDays = visitor.consecutive_days;
    const lastDate = visitor.last_visit_date;

    if (lastDate === today) {
      // 今天已来过
    } else if (lastDate) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      consecutiveDays = (lastDate === yesterday) ? consecutiveDays + 1 : 1;
    } else {
      consecutiveDays = 1;
    }

    let poisonUnlocked = visitor.poison_unlocked;
    if (consecutiveDays >= 3 && !poisonUnlocked) poisonUnlocked = 1;

    db.prepare(`
      UPDATE visitors
      SET last_visit_at = ?, last_visit_date = ?, consecutive_days = ?,
          nickname = COALESCE(?, nickname), poison_unlocked = ?
      WHERE id = ?
    `).run(now, today, consecutiveDays, nickname || null, poisonUnlocked, visitorId);

    visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(visitorId);
  }

  updateDailyStats(visitorId, false, false, null);

  res.json({
    visitor: {
      id: visitor.id,
      nickname: visitor.nickname,
      consecutiveDays: visitor.consecutive_days,
      totalDraws: visitor.total_draws,
      totalSins: visitor.total_sins,
      poisonUnlocked: !!visitor.poison_unlocked,
      firstVisitAt: visitor.first_visit_at,
      lastVisitAt: visitor.last_visit_at
    }
  });
});

// 2. 获取访客状态
app.get('/api/visitor/:id', (req, res) => {
  const visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(req.params.id);
  if (!visitor) return res.status(404).json({ error: '访客不存在' });

  const sins = db.prepare(`
    SELECT food_name, food_icon, mood, drawn_at as time
    FROM draws WHERE visitor_id = ? AND accepted = 0
    ORDER BY drawn_at DESC LIMIT 50
  `).all(req.params.id);

  res.json({
    visitor: {
      id: visitor.id,
      nickname: visitor.nickname,
      consecutiveDays: visitor.consecutive_days,
      totalDraws: visitor.total_draws,
      totalSins: visitor.total_sins,
      poisonUnlocked: !!visitor.poison_unlocked,
      firstVisitAt: visitor.first_visit_at,
      lastVisitAt: visitor.last_visit_at
    },
    sinRecords: sins.map(s => ({
      food: s.food_name,
      icon: s.food_icon,
      time: s.time,
      mood: s.mood
    }))
  });
});

// 3. 记录抽签
app.post('/api/draw', (req, res) => {
  const { visitorId, foodId, foodName, foodIcon, foodCategory, timePeriod, mood, accepted } = req.body;
  if (!visitorId || !foodId) return res.status(400).json({ error: '缺少必要参数' });

  const result = db.prepare(`
    INSERT INTO draws (visitor_id, food_id, food_name, food_icon, food_category, time_period, mood, accepted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(visitorId, foodId, foodName, foodIcon, foodCategory || null, timePeriod, mood, accepted ? 1 : 0);

  if (accepted) {
    db.prepare('UPDATE visitors SET total_draws = total_draws + 1 WHERE id = ?').run(visitorId);
  } else {
    db.prepare('UPDATE visitors SET total_draws = total_draws + 1, total_sins = total_sins + 1 WHERE id = ?').run(visitorId);
  }

  updateDailyStats(visitorId, true, !accepted, foodName);

  res.json({ drawId: result.lastInsertRowid, success: true });
});

// 4. 抽签历史
app.get('/api/visitor/:id/draws', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const draws = db.prepare(`
    SELECT id, food_name, food_icon, food_category, time_period, mood, accepted, drawn_at
    FROM draws WHERE visitor_id = ?
    ORDER BY drawn_at DESC LIMIT ? OFFSET ?
  `).all(req.params.id, limit, offset);

  const total = db.prepare('SELECT COUNT(*) as cnt FROM draws WHERE visitor_id = ?').get(req.params.id);

  res.json({ draws, total: total.cnt, limit, offset });
});

// 5. 记仇本
app.get('/api/visitor/:id/sins', (req, res) => {
  const sins = db.prepare(`
    SELECT id, food_name, food_icon, mood, drawn_at as time
    FROM draws WHERE visitor_id = ? AND accepted = 0
    ORDER BY drawn_at DESC
  `).all(req.params.id);
  res.json({ sins });
});

// 6. 设置昵称
app.post('/api/visitor/:id/nickname', (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) return res.status(400).json({ error: '昵称不能为空' });

  db.prepare('UPDATE visitors SET nickname = ? WHERE id = ?').run(nickname.trim(), req.params.id);
  res.json({ success: true, nickname: nickname.trim() });
});

// 7. 全局统计
app.get('/api/stats/global', (req, res) => {
  const totalVisitors = db.prepare('SELECT COUNT(*) as cnt FROM visitors').get();
  const totalDraws = db.prepare('SELECT COUNT(*) as cnt FROM draws').get();
  const totalSins = db.prepare('SELECT COUNT(*) as cnt FROM draws WHERE accepted = 0').get();
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = db.prepare('SELECT * FROM daily_stats WHERE date = ?').get(today);

  const topFoods = db.prepare(`
    SELECT food_name, food_icon, COUNT(*) as cnt
    FROM draws WHERE accepted = 1
    GROUP BY food_name ORDER BY cnt DESC LIMIT 10
  `).all();

  const topRejected = db.prepare(`
    SELECT food_name, food_icon, COUNT(*) as cnt
    FROM draws WHERE accepted = 0
    GROUP BY food_name ORDER BY cnt DESC LIMIT 5
  `).all();

  const weekStats = db.prepare(`
    SELECT * FROM daily_stats
    WHERE date >= date('now', '-7 days')
    ORDER BY date DESC
  `).all();

  res.json({
    totalVisitors: totalVisitors.cnt,
    totalDraws: totalDraws.cnt,
    totalSins: totalSins.cnt,
    today: todayStats || { total_draws: 0, total_sins: 0, unique_visitors: 0 },
    topFoods,
    topRejected,
    weekStats
  });
});

// 8. 食物战争 - 当前活动
app.get('/api/war/current', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const war = db.prepare('SELECT * FROM food_wars WHERE event_date = ? AND active = 1').get(today);
  res.json({ war: war || null });
});

// 9. 食物战争 - 投票
app.post('/api/war/vote', (req, res) => {
  const { visitorId, faction } = req.body;
  if (!visitorId || !faction) return res.status(400).json({ error: '缺少参数' });

  const today = new Date().toISOString().slice(0, 10);
  const war = db.prepare('SELECT * FROM food_wars WHERE event_date = ? AND active = 1').get(today);
  if (!war) return res.status(404).json({ error: '今日无战争活动' });
  if (faction !== war.faction_a && faction !== war.faction_b) {
    return res.status(400).json({ error: '无效的阵营' });
  }

  const existing = db.prepare('SELECT * FROM war_votes WHERE war_id = ? AND visitor_id = ?').get(war.id, visitorId);
  if (existing) return res.status(409).json({ error: '你已投过票了' });

  db.prepare('INSERT INTO war_votes (war_id, visitor_id, faction) VALUES (?, ?, ?)').run(war.id, visitorId, faction);

  const col = faction === war.faction_a ? 'score_a' : 'score_b';
  db.prepare(`UPDATE food_wars SET ${col} = ${col} + 1 WHERE id = ?`).run(war.id);

  const updated = db.prepare('SELECT * FROM food_wars WHERE id = ?').get(war.id);
  res.json({ success: true, war: updated });
});

// 10. 创建战争活动（管理用）
app.post('/api/war/create', (req, res) => {
  const { eventDate, eventName, factionA, factionB } = req.body;
  if (!eventDate || !eventName || !factionA || !factionB) {
    return res.status(400).json({ error: '缺少参数' });
  }
  const existing = db.prepare('SELECT * FROM food_wars WHERE event_date = ?').get(eventDate);
  if (existing) return res.status(409).json({ error: '该日期已有活动' });

  const result = db.prepare(`
    INSERT INTO food_wars (event_date, event_name, faction_a, faction_b)
    VALUES (?, ?, ?, ?)
  `).run(eventDate, eventName, factionA, factionB);

  res.json({ warId: result.lastInsertRowid, success: true });
});

// 11. AI 神谕代理（服务端转发，隐藏 API Key）
app.post('/api/ai/speak', async (req, res) => {
  if (!AI_API_KEY) {
    return res.status(503).json({ error: 'AI 未配置，请在环境变量中设置 AI_API_KEY' });
  }

  const { systemPrompt, userPrompt } = req.body;
  if (!systemPrompt || !userPrompt) {
    return res.status(400).json({ error: '缺少 systemPrompt 或 userPrompt' });
  }

  try {
    const provider = AI_PROVIDER || 'groq';
    const model = AI_MODEL || AI_PROVIDERS[provider]?.defaultModel || 'llama-3.1-8b-instant';
    const response = await callAI(provider, model, AI_API_KEY, systemPrompt, userPrompt);
    res.json({ text: response });
  } catch (e) {
    console.error('AI 调用失败:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 12. AI 配置状态（让前端知道是否已配置）
app.get('/api/ai/status', (req, res) => {
  res.json({
    configured: !!AI_API_KEY,
    provider: AI_PROVIDER || 'groq',
    providerName: AI_PROVIDERS[AI_PROVIDER]?.name || AI_PROVIDERS.groq.name
  });
});

// 13. 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════
//  启动
// ═══════════════════════════════════════════
initDatabase();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务器...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到 SIGTERM，正在关闭...');
  db.close();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🥢  食神签后端已启动');
  console.log('─────────────────────────────────');
  console.log(`  端口:      ${PORT}`);
  console.log(`  数据库:    ${DB_PATH}`);
  console.log(`  健康检查:  /api/health`);
  console.log(`  AI 神谕:   ${AI_API_KEY ? '✅ 已配置 (' + (AI_PROVIDER || 'groq') + ')' : '⚠️  未配置（需设置 AI_API_KEY 环境变量）'}`);
  console.log('─────────────────────────────────');
  console.log('');
});
