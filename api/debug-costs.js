const { verifyAuth } = require('./_auth');

module.exports = async (req, res) => {
  const user = verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = process.env.ANTHROPIC_ADMIN_API_KEY;
  const info = {
    key_exists: !!key,
    key_prefix: key ? key.substring(0, 20) + '...' : null,
    key_length: key ? key.length : 0,
  };

  // Test a small request to the Anthropic API
  try {
    const url = 'https://api.anthropic.com/v1/organizations/cost_report?starting_at=2026-02-19T00:00:00Z&ending_at=2026-02-20T23:59:59Z&bucket_width=1d';
    const apiRes = await fetch(url, {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': key || '',
      },
    });
    const body = await apiRes.text();
    info.api_status = apiRes.status;
    info.api_response = body.substring(0, 500);
  } catch (err) {
    info.api_error = err.message;
  }

  res.json(info);
};
