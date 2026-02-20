const { verifyAuth } = require('../_auth');

module.exports = (req, res) => {
  const user = verifyAuth(req);
  if (!user) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, user });
};
