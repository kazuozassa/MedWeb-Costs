const { createToken, ALLOWED_USERS } = require('../_auth');

module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) {
    res.writeHead(302, { Location: '/?error=no_code' });
    return res.end();
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      res.writeHead(302, { Location: '/?error=token_failed' });
      return res.end();
    }

    // Get user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Check if user is allowed
    if (!ALLOWED_USERS.includes(user.login.toLowerCase())) {
      res.writeHead(302, { Location: '/?error=unauthorized' });
      return res.end();
    }

    // Create JWT and set cookie
    const jwt = createToken(user);
    const isProduction = req.headers.host && !req.headers.host.includes('localhost');
    const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${isProduction ? '; Secure' : ''}`;

    res.writeHead(302, {
      Location: '/',
      'Set-Cookie': `session=${jwt}; ${cookieFlags}`,
    });
    res.end();
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.writeHead(302, { Location: '/?error=server_error' });
    res.end();
  }
};
