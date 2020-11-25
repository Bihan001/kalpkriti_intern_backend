const jwt = require('jsonwebtoken');
const config = require('config');

module.exports = (req, res, next) => {
  const token = req.headers['token'];
  if (!token)
    return res.status(402).json({ data: { error: 'No token, Unauthorized' } });
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    console.log(err.message);
    res.status(401).json({ data: { error: 'Invalid token, Unauthorized' } });
  }
};
