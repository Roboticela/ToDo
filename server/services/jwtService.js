import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiry,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret);
}

export function getExpirySeconds(expiryStr) {
  const match = expiryStr.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // default 15 min in seconds
  const [, n, unit] = match;
  const num = Number(n);
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return num * (multipliers[unit] || 60);
}
