const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const ALLOWED_USERS = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase());

function verifyAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;

  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    if (!ALLOWED_USERS.includes(payload.login.toLowerCase())) return null;
    return payload;
  } catch {
    return null;
  }
}

function createToken(user) {
  return jwt.sign(
    { login: user.login, name: user.name, avatar: user.avatar_url },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { verifyAuth, createToken, ALLOWED_USERS };
