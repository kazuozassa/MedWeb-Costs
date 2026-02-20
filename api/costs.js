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

async function fetchWithRetry(url, headers, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;
    if (res.status === 429 && i < retries - 1) {
      const wait = Math.pow(2, i + 1) * 1000;
      console.log(`Rate limited, waiting ${wait}ms before retry ${i + 1}...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    const text = await res.text();
    console.error(`Anthropic API error: ${res.status} ${text}`);
    return null;
  }
  return null;
}

async function fetchAnthropicCosts(startDate, endDate) {
  try {
    const headers = {
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    };

    let totalUSD = 0;
    let currentStart = `${startDate}T00:00:00Z`;
    const finalEnd = `${endDate}T23:59:59Z`;

    while (currentStart < finalEnd) {
      const url = `${BASE_URL}/cost_report?starting_at=${currentStart}&ending_at=${finalEnd}&bucket_width=1d`;
      const res = await fetchWithRetry(url, headers);
      if (!res) return null;

      const page = await res.json();
      const buckets = page.data || [];

      for (const bucket of buckets) {
        for (const r of (bucket.results || [])) {
          totalUSD += parseFloat(r.amount || '0');
        }
      }

      if (!page.has_more || buckets.length === 0) break;

      // Use the last bucket's ending_at as the next starting_at
      currentStart = buckets[buckets.length - 1].ending_at;
    }

    return totalUSD;
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
