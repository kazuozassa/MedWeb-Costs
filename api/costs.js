const { verifyAuth } = require('./_auth');

const IOF_RATE = 0.035;
const BRL_RATE = 5.80;

// All project costs — values based on actual invoices and subscriptions
// Claude.ai invoices are in BRL (already charged to card)
// Other services are in USD (converted with BRL_RATE + IOF)
const COSTS = [
  // API Tokens — Anthropic API usage (USD, converted to BRL + IOF)
  // Value from env var ANTHROPIC_API_TOKENS_USD, or fallback estimate
  { id: 'api_tokens', label: 'API Tokens (Anthropic)', usd: parseFloat(process.env.ANTHROPIC_API_TOKENS_USD || '1766.32'), currency: 'USD' },

  // Claude.ai — actual invoices from billing page
  { id: 'claude_ai', label: 'Claude.ai (mai/2025)', brl: 550.00, currency: 'BRL' },
  { id: 'claude_ai', label: 'Claude.ai (jan/2026)', brl: 1100.00, currency: 'BRL' },
  { id: 'claude_ai', label: 'Claude.ai (fev/2026)', brl: 81.84, currency: 'BRL' },
  { id: 'claude_ai', label: 'Claude.ai Uso Extra', brl: 275.00, currency: 'BRL' },

  // Other subscriptions (USD, converted to BRL + IOF)
  { id: 'lovable_pro', label: 'Lovable Pro (5 meses)', usd: 125, currency: 'USD' },
  { id: 'vercel_pro', label: 'Vercel Pro (5 meses)', usd: 100, currency: 'USD' },
  { id: 'apple_developer', label: 'Apple Developer (anual)', usd: 99, currency: 'USD' },
];

function buildCostItems() {
  return COSTS.map(item => {
    if (item.currency === 'BRL') {
      // Already in BRL — no conversion needed, IOF already included in invoice
      return {
        id: item.id,
        label: item.label,
        usd: Math.round((item.brl / BRL_RATE) * 100) / 100,
        brl: item.brl,
        iof: 0,
        total_brl: item.brl,
      };
    }
    // USD — convert to BRL and add IOF
    const brl = item.usd * BRL_RATE;
    const iof = brl * IOF_RATE;
    return {
      id: item.id,
      label: item.label,
      usd: item.usd,
      brl: Math.round(brl * 100) / 100,
      iof: Math.round(iof * 100) / 100,
      total_brl: Math.round((brl + iof) * 100) / 100,
    };
  });
}

module.exports = (req, res) => {
  const user = verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const items = buildCostItems();

  const totalUsd = items.reduce((s, c) => s + c.usd, 0);
  const totalBrl = items.reduce((s, c) => s + c.total_brl, 0);
  const totalIof = items.reduce((s, c) => s + c.iof, 0);

  const projectBudget = 536500;

  res.json({
    period: { start: '2025-05-01', end: new Date().toISOString().split('T')[0] },
    exchange: { usd_brl: BRL_RATE, iof_rate: IOF_RATE },
    items,
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
