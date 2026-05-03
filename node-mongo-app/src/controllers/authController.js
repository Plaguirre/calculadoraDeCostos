const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '7d';
const SALT_ROUNDS = 12;
const MAX_REFRESH_TOKENS = 5; // evitar acumulación de tokens

function signAccessToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { userId: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// ─── Register ────────────────────────────────────────────────────────────────

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: 'Email ya registrado' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ name, email, password: hashed });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    user.refreshTokens = [hashToken(refreshToken)];
    await user.save();

    setRefreshCookie(res, refreshToken);
    logger.info(`Nuevo usuario registrado: ${user._id}`);
    res.status(201).json({ accessToken });
  } catch (err) {
    next(err);
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    // Comparar siempre para evitar timing attacks
    const dummyHash = '$2b$12$invalidhashpaddingtomatchlength000000000000000000000000';
    const match = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !match) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // Rotar: agregar nuevo token hasheado, limitar cantidad
    user.refreshTokens.push(hashToken(refreshToken));
    if (user.refreshTokens.length > MAX_REFRESH_TOKENS) {
      user.refreshTokens = user.refreshTokens.slice(-MAX_REFRESH_TOKENS);
    }
    await user.save();

    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
};

// ─── Refresh Token ───────────────────────────────────────────────────────────

exports.refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'Sin refresh token' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch {
      return res.status(401).json({ message: 'Refresh token inválido' });
    }

    const user = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ message: 'Usuario no encontrado' });

    const hashed = hashToken(token);
    const foundIndex = user.refreshTokens.indexOf(hashed);

    if (foundIndex === -1) {
      // Posible reutilización — invalidar toda la sesión
      user.refreshTokens = [];
      await user.save();
      logger.warn(`Posible reutilización de refresh token para usuario ${user._id}`);
      return res.status(401).json({ message: 'Token no reconocido' });
    }

    // Rotar: quitar el usado, emitir uno nuevo
    user.refreshTokens.splice(foundIndex, 1);
    const newRefreshToken = signRefreshToken(user);
    user.refreshTokens.push(hashToken(newRefreshToken));
    if (user.refreshTokens.length > MAX_REFRESH_TOKENS) {
      user.refreshTokens = user.refreshTokens.slice(-MAX_REFRESH_TOKENS);
    }
    await user.save();

    const newAccessToken = signAccessToken(user);
    setRefreshCookie(res, newRefreshToken);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
};

// ─── Logout ──────────────────────────────────────────────────────────────────

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(payload.userId);
        if (user) {
          const hashed = hashToken(token);
          user.refreshTokens = user.refreshTokens.filter((t) => t !== hashed);
          await user.save();
        }
      } catch {
        // token inválido — igual limpiar cookie
      }
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.json({ message: 'Sesión cerrada' });
  } catch (err) {
    next(err);
  }
};

// ─── Me ──────────────────────────────────────────────────────────────────────

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password -refreshTokens')
      .lean();
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};
