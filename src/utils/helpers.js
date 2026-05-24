// src/utils/helpers.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ── JWT ──────────────────────────────────────────────────────

exports.signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });

exports.verifyToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);

exports.verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);

// ── Response helpers ─────────────────────────────────────────

exports.success = (res, data, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

exports.created = (res, data, message = 'Created') =>
  res.status(201).json({ success: true, message, data });

exports.error = (res, message, statusCode = 400, details = null) =>
  res.status(statusCode).json({ success: false, message, ...(details && { details }) });

exports.serverError = (res, err) => {
  console.error('🔥 Server error:', err);
  return res.status(500).json({ success: false, message: 'Internal server error' });
};

// ── Token generation ─────────────────────────────────────────

exports.generateToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString('hex');

// ── Pagination ────────────────────────────────────────────────

exports.paginate = (query, page = 1, limit = 20) => {
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  return { limit: parseInt(limit), offset };
};

exports.paginatedResponse = (rows, total, page, limit) => ({
  rows,
  pagination: {
    total: parseInt(total),
    page: parseInt(page),
    limit: parseInt(limit),
    pages: Math.ceil(total / limit),
  },
});

// ── AICTE Points map by category ─────────────────────────────

exports.getActivityPoints = (category, role = 'participant') => {
  const base = { Technical: 10, Workshop: 8, Cultural: 6, Sports: 6, Management: 5, 'Non-Technical': 4 };
  const roleMultiplier = { winner: 2.5, runner: 1.8, participant: 1 };
  return Math.round((base[category] || 5) * (roleMultiplier[role] || 1));
};
