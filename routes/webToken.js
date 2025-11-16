import jwt from 'jsonwebtoken';

export const webToken = (req, res, next) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verify error', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};
