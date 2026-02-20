const { verifyAuth } = require('./_auth');

const IOF_RATE = 0.035;
const BRL_RATE = 5.80;

// Monthly cost entries — each entry is one charge in one month
// currency: 'BRL' = already charged in BRL (no IOF), 'USD' = needs conversion + IOF
const MONTHLY_COSTS = [
  // API Tokens — Anthropic API (acumulado, distribuído por mês de uso)
  { month: '2025-10', id: 'api_tokens', label: 'API Tokens', usd: 200, currency: 'USD' },
  { month: '2025-11', id: 'api_tokens', label: 'API Tokens', usd: 350, currency: 'USD' },
  { month: '2025-12', id: 'api_tokens', label: 'API Tokens', usd: 400, currency: 'USD' },
  { month: '2026-01', id: 'api_tokens', label: 'API Tokens', usd: 450, currency: 'USD' },
  { month: '2026-02', id: 'api_tokens', label: 'API Tokens', usd: 366.32, currency: 'USD' },

  // Claude.ai — faturas reais do billing page
  { month: '2025-05', id: 'claude_ai', label: 'Claude.ai', brl: 550.00, currency: 'BRL' },
  { month: '2026-01', id: 'claude_ai', label: 'Claude.ai', brl: 1100.00, currency: 'BRL' },
  { month: '2026-02', id: 'claude_ai', label: 'Claude.ai', brl: 81.84, currency: 'BRL' },
  { month: '2026-02', id: 'claude_ai_extra', label: 'Claude.ai Uso Extra', brl: 275.00, currency: 'BRL' },

  // Lovable Pro — $25/mês
  { month: '2025-10', id: 'lovable_pro', label: 'Lovable Pro', usd: 25, currency: 'USD' },
  { month: '2025-11', id: 'lovable_pro', label: 'Lovable Pro', usd: 25, currency: 'USD' },
  { month: '2025-12', id: 'lovable_pro', label: 'Lovable Pro', usd: 25, currency: 'USD' },
  { month: '2026-01', id: 'lovable_pro', label: 'Lovable Pro', usd: 25, currency: 'USD' },
  { month: '2026-02', id: 'lovable_pro', label: 'Lovable Pro', usd: 25, currency: 'USD' },

  // Vercel Pro — $20/mês
  { month: '2025-10', id: 'vercel_pro', label: 'Vercel Pro', usd: 20, currency: 'USD' },
  { month: '2025-11', id: 'vercel_pro', label: 'Vercel Pro', usd: 20, currency: 'USD' },
  { month: '2025-12', id: 'vercel_pro', label: 'Vercel Pro', usd: 20, currency: 'USD' },
  { month: '2026-01', id: 'vercel_pro', label: 'Vercel Pro', usd: 20, currency: 'USD' },
  { month: '2026-02', id: 'vercel_pro', label: 'Vercel Pro', usd: 20, currency: 'USD' },

  // Apple Developer — $99/ano (cobrado uma vez)
  { month: '2025-10', id: 'apple_developer', label: 'Apple Developer', usd: 99, currency: 'USD' },
];

function convertItem(item) {
  if (item.currency === 'BRL') {
    return {
      month: item.month,
      id: item.id,
      label: item.label,
      usd: Math.round((item.brl / BRL_RATE) * 100) / 100,
      brl: item.brl,
      iof: 0,
      total_brl: item.brl,
    };
  }
  const brl = item.usd * BRL_RATE;
  const iof = brl * IOF_RATE;
  return {
    month: item.month,
    id: item.id,
    label: item.label,
    usd: item.usd,
    brl: Math.round(brl * 100) / 100,
    iof: Math.round(iof * 100) / 100,
    total_brl: Math.round((brl + iof) * 100) / 100,
  };
}

module.exports = (req, res) => {
  const user = verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const entries = MONTHLY_COSTS.map(convertItem);

  // Aggregate by service for summary table
  const byService = {};
  for (const e of entries) {
    if (!byService[e.id]) {
      byService[e.id] = { id: e.id, label: e.label, usd: 0, brl: 0, iof: 0, total_brl: 0 };
    }
    byService[e.id].usd += e.usd;
    byService[e.id].brl += e.brl;
    byService[e.id].iof += e.iof;
    byService[e.id].total_brl += e.total_brl;
  }
  const items = Object.values(byService).map(s => ({
    ...s,
    usd: Math.round(s.usd * 100) / 100,
    brl: Math.round(s.brl * 100) / 100,
    iof: Math.round(s.iof * 100) / 100,
    total_brl: Math.round(s.total_brl * 100) / 100,
  }));

  // Monthly breakdown
  const months = [...new Set(entries.map(e => e.month))].sort();
  const monthly = months.map(m => {
    const monthEntries = entries.filter(e => e.month === m);
    const total_brl = monthEntries.reduce((s, e) => s + e.total_brl, 0);
    return {
      month: m,
      entries: monthEntries,
      total_brl: Math.round(total_brl * 100) / 100,
    };
  });

  const totalUsd = items.reduce((s, c) => s + c.usd, 0);
  const totalBrl = items.reduce((s, c) => s + c.total_brl, 0);
  const totalIof = items.reduce((s, c) => s + c.iof, 0);
  const projectBudget = 536500;

  res.json({
    period: { start: '2025-05-01', end: new Date().toISOString().split('T')[0] },
    exchange: { usd_brl: BRL_RATE, iof_rate: IOF_RATE },
    items,
    monthly,
    totals: {
      usd: Math.round(totalUsd * 100) / 100,
      brl: Math.round(totalBrl * 100) / 100,
      iof: Math.round(totalIof * 100) / 100,
      budget_brl: projectBudget,
      budget_pct: Math.round((totalBrl / projectBudget) * 10000) / 100,
    },
    fetched_at: new Date().toISOString(),
  });
};
