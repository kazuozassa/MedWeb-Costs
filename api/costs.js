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

async function fetchAnthropicUsage(startDate, endDate) {
  try {
    const url = `${BASE_URL}/usage_report/messages?starting_at=${startDate}T00:00:00Z&ending_at=${endDate}T23:59:59Z&bucket_width=1d&group_by[]=model`;
    const res = await fetch(url, {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Anthropic usage API error:', res.status, text);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('Anthropic usage fetch error:', err);
    return null;
  }
}

async function fetchAnthropicCosts(startDate, endDate) {
  try {
    const url = `${BASE_URL}/cost_report?starting_at=${startDate}T00:00:00Z&ending_at=${endDate}T23:59:59Z&bucket_width=1mo`;
    const res = await fetch(url, {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Anthropic cost API error:', res.status, text);
      return null;
    }
    return res.json();
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

  // Fetch Anthropic data in parallel
  const [usage, costs] = await Promise.all([
    fetchAnthropicUsage(startDate, endDate),
    fetchAnthropicCosts(startDate, endDate),
  ]);

  // Calculate API token costs in USD from cost report
  let apiTokensUSD = 0;
  if (costs && costs.data) {
    for (const bucket of costs.data) {
      // Cost values are in cents as strings
      const tokenCost = parseFloat(bucket.token_usage_cost || '0') / 100;
      const searchCost = parseFloat(bucket.web_search_cost || '0') / 100;
      const codeCost = parseFloat(bucket.code_execution_cost || '0') / 100;
      apiTokensUSD += tokenCost + searchCost + codeCost;
    }
  }

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
      usage_raw: usage,
      costs_raw: costs,
    },
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
