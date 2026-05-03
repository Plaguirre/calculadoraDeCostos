const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  const token = auth.slice(7); // más eficiente que split
  try {
    req.user = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
    return res.status(401).json({ message });
  }
};
