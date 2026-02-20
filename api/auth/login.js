module.exports = (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/auth/callback`;
  const scope = 'read:user';

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  res.writeHead(302, { Location: url });
  res.end();
};
