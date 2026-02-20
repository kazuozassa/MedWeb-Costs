module.exports = (req, res) => {
  const isProduction = req.headers.host && !req.headers.host.includes('localhost');
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`;
  res.writeHead(302, {
    Location: '/',
    'Set-Cookie': `session=; ${cookieFlags}`,
  });
  res.end();
};
