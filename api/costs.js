const { verifyAuth } = require('./_auth');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_ADMIN_API_KEY;
const BASE_URL = 'https://api.anthropic.com/v1/organizations';

// Fixed monthly costs (USD) - MedWeb project
const FIXED_COSTS = [
  { id: 'claude_max_5x', label: 'Claude Max 5x', monthly_usd: 100, start: '2025-10', end: '2026-01' },
  { id: 'claude_max_20x', label: 'Claude Max 20x', monthly_usd: 200, start: '2026-02', end: null },
  { id: 'lovable_pro', label: 'Lovable Pro', monthly_usd: 25, start: '2025-10', end: null },
  { id: 'vercel_pro', label: 'Vercel Pro', monthly_usd: 20, start: '2025-10', end: null },
  { id: 'apple_developer', label: 'Apple Developer Program', yearly_usd: 99, start: '2025-10', end: null },
];

const IOF_RATE = 0.035;
const BRL_RATE = 5.80; // Will be updated with live rate if possible

function getFixedCostsForPeriod(startDate, endDate) {
  const costs = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const item of FIXED_COSTS) {
    const itemStart = new Date(item.start + '-01');
    const itemEnd = item.end ? new Date(item.end + '-28') : end;

    // Count months in overlap
    let months = 0;
    let d = new Date(Math.max(start, itemStart));
    const stop = new Date(Math.min(end, itemEnd));

    while (d <= stop) {
      months++;
      d.setMonth(d.getMonth() + 1);
    }

    if (months > 0) {
      const usd = item.monthly_usd ? item.monthly_usd * months : item.yearly_usd || 0;
      const brl = usd * BRL_RATE;
      const iof = brl * IOF_RATE;

      costs.push({
        id: item.id,
        label: item.label,
        months,
        usd,
        brl,
        iof,
        total_brl: brl + iof,
      });
    }
  }
  return costs;
}

function getMonthRanges(startDate, endDate) {
  const ranges = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    const monthStart = new Date(Math.max(cursor, start));
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const rangeEnd = new Date(Math.min(monthEnd, end));

    ranges.push({
      start: monthStart.toISOString().split('T')[0],
      end: rangeEnd.toISOString().split('T')[0],
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ranges;
}

async function fetchMonthCost(start, end) {
  const url = `${BASE_URL}/cost_report?starting_at=${start}T00:00:00Z&ending_at=${end}T23:59:59Z&bucket_width=1d`;
  const res = await fetch(url, {
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Anthropic cost API error (${start}): ${res.status} ${text}`);
    return null;
  }

  const page = await res.json();
  let total = 0;
  for (const bucket of (page.data || [])) {
    for (const r of (bucket.results || [])) {
      total += parseFloat(r.amount || '0');
    }
  }
  return total;
}

async function fetchAnthropicCosts(startDate, endDate) {
  try {
    const ranges = getMonthRanges(startDate, endDate);
    const results = await Promise.all(
      ranges.map(r => fetchMonthCost(r.start, r.end))
    );

    if (results.every(r => r === null)) return null;

    return results.reduce((sum, v) => sum + (v || 0), 0);
  } catch (err) {
    console.error('Anthropic cost fetch error:', err);
    return null;
  }
}

module.exports = async (req, res) => {
  // Auth check
  const user = verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Default: from project start to today
  const startDate = req.query.start || '2025-10-01';
  const endDate = req.query.end || new Date().toISOString().split('T')[0];

  // Fetch Anthropic cost data (with pagination)
  const apiTokensResult = await fetchAnthropicCosts(startDate, endDate);
  const apiTokensUSD = apiTokensResult !== null ? apiTokensResult : 0;
  const apiDataAvailable = apiTokensResult !== null;

  const apiTokensBRL = apiTokensUSD * BRL_RATE;
  const apiTokensIOF = apiTokensBRL * IOF_RATE;

  // Fixed costs
  const fixedCosts = getFixedCostsForPeriod(startDate, endDate);
  const totalFixedUSD = fixedCosts.reduce((s, c) => s + c.usd, 0);
  const totalFixedBRL = fixedCosts.reduce((s, c) => s + c.total_brl, 0);

  // Grand total
  const totalUSD = apiTokensUSD + totalFixedUSD;
  const totalBRL = (apiTokensBRL + apiTokensIOF) + totalFixedBRL;

  // Project budget
  const projectBudget = 536500;

  res.json({
    period: { start: startDate, end: endDate },
    exchange: { usd_brl: BRL_RATE, iof_rate: IOF_RATE },
    api_tokens: {
      usd: Math.round(apiTokensUSD * 100) / 100,
      brl: Math.round(apiTokensBRL * 100) / 100,
      iof: Math.round(apiTokensIOF * 100) / 100,
      total_brl: Math.round((apiTokensBRL + apiTokensIOF) * 100) / 100,
    },
    api_available: apiDataAvailable,
    fixed_costs: fixedCosts,
    totals: {
      usd: Math.round(totalUSD * 100) / 100,
      brl: Math.round(totalBRL * 100) / 100,
      budget_brl: projectBudget,
      budget_pct: Math.round((totalBRL / projectBudget) * 10000) / 100,
    },
    fetched_at: new Date().toISOString(),
  });
};
