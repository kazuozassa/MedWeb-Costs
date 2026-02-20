const { verifyAuth } = require('./_auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_ADMIN_API_KEY;
const BASE_URL = 'https://api.anthropic.com/v1/organizations';

const IOF_RATE = 0.035;
const BRL_RATE = 5.80;

// In-memory cache for Anthropic API data
let apiCache = null;
let apiCacheAt = 0;
const API_CACHE_TTL = 60 * 60 * 1000; // 1 hour
let apiCooldownUntil = 0;

// Fixed costs (non-API) — actual invoices and subscriptions
const FIXED_MONTHLY = [
  // Claude.ai — faturas reais do billing page (BRL)
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

// Fallback API token estimates (used when API is unavailable)
const FALLBACK_API_TOKENS = [
  { month: '2025-10', usd: 200 },
  { month: '2025-11', usd: 350 },
  { month: '2025-12', usd: 400 },
  { month: '2026-01', usd: 450 },
  { month: '2026-02', usd: 366.32 },
];

function convertItem(item) {
  if (item.currency === 'BRL') {
    return {
      month: item.month, id: item.id, label: item.label,
      usd: Math.round((item.brl / BRL_RATE) * 100) / 100,
      brl: item.brl, iof: 0, total_brl: item.brl,
    };
  }
  const brl = item.usd * BRL_RATE;
  const iof = brl * IOF_RATE;
  return {
    month: item.month, id: item.id, label: item.label,
    usd: item.usd,
    brl: Math.round(brl * 100) / 100,
    iof: Math.round(iof * 100) / 100,
    total_brl: Math.round((brl + iof) * 100) / 100,
  };
}

// Fetch monthly API costs from Anthropic Admin API
async function fetchApiTokensByMonth() {
  if (!ANTHROPIC_API_KEY) return null;

  // Check cache
  if (apiCache && (Date.now() - apiCacheAt) < API_CACHE_TTL) return apiCache;

  // Check cooldown
  if (Date.now() < apiCooldownUntil) return null;

  try {
    const headers = { 'anthropic-version': '2023-06-01', 'x-api-key': ANTHROPIC_API_KEY };
    const startDate = '2025-10-01';
    const endDate = new Date().toISOString().split('T')[0];

    // Fetch all pages sequentially
    const dailyTotals = {};
    let currentStart = `${startDate}T00:00:00Z`;
    const finalEnd = `${endDate}T23:59:59Z`;

    while (currentStart < finalEnd) {
      const url = `${BASE_URL}/cost_report?starting_at=${currentStart}&ending_at=${finalEnd}&bucket_width=1d`;
      const res = await fetch(url, { headers });

      if (res.status === 429) {
        console.error('Anthropic API rate limited, cooling down 15min');
        apiCooldownUntil = Date.now() + 15 * 60 * 1000;
        return null;
      }
      if (!res.ok) {
        console.error(`Anthropic API error: ${res.status}`);
        return null;
      }

      const page = await res.json();
      const buckets = page.data || [];

      for (const bucket of buckets) {
        const month = bucket.starting_at.substring(0, 7); // "2025-10"
        for (const r of (bucket.results || [])) {
          dailyTotals[month] = (dailyTotals[month] || 0) + parseFloat(r.amount || '0');
        }
      }

      if (!page.has_more || buckets.length === 0) break;
      await new Promise(r => setTimeout(r, 1500));
      currentStart = buckets[buckets.length - 1].ending_at;
    }

    // Convert to monthly array
    const result = Object.entries(dailyTotals)
      .map(([month, usd]) => ({ month, usd: Math.round(usd * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    apiCache = result;
    apiCacheAt = Date.now();
    return result;
  } catch (err) {
    console.error('Anthropic API fetch error:', err);
    return null;
  }
}

module.exports = async (req, res) => {
  const user = verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Try to get real API data, fallback to estimates
  const apiMonthly = await fetchApiTokensByMonth();
  const apiDataAvailable = apiMonthly !== null;
  const apiTokens = apiDataAvailable ? apiMonthly : FALLBACK_API_TOKENS;

  // Build API token entries
  const apiEntries = apiTokens.map(t => ({
    month: t.month, id: 'api_tokens', label: 'API Tokens', usd: t.usd, currency: 'USD',
  }));

  // Combine all entries
  const allCosts = [...apiEntries, ...FIXED_MONTHLY];
  const entries = allCosts.map(convertItem);

  // Aggregate by service
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
    return { month: m, entries: monthEntries, total_brl: Math.round(total_brl * 100) / 100 };
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
    api_available: apiDataAvailable,
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
