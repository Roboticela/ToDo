import jwt from "jsonwebtoken";
import { config } from "../config.js";

const PURPOSE = "reminders";
const EXPIRY = "365d";

export function createUnsubscribeToken(userId) {
  return jwt.sign(
    { userId, purpose: PURPOSE },
    config.email.unsubscribeSecret,
    { expiresIn: EXPIRY }
  );
}

export function verifyUnsubscribeToken(token) {
  try {
    const payload = jwt.verify(token, config.email.unsubscribeSecret);
    if (payload.purpose !== PURPOSE || !payload.userId) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
