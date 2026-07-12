import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { sendSubscriptionReminderEmail } from "../services/emailService.js";
import { createUnsubscribeToken } from "../services/unsubscribeToken.js";

const INTERVAL_MS = 60 * 60 * 1000; // run every hour

function getReminderCutoff() {
  const days = config.email.subscriptionReminderIntervalDays;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function runReminderJob() {
  try {
    const cutoff = getReminderCutoff();
    const users = await prisma.user.findMany({
      where: {
        plan: "free",
        subscribedToReminders: true,
        OR: [
          { lastSubscriptionReminderAt: null },
          { lastSubscriptionReminderAt: { lt: cutoff } },
        ],
      },
    });
    for (const user of users) {
      try {
        const unsubscribeToken = createUnsubscribeToken(user.id);
        await sendSubscriptionReminderEmail(user.email, user.name, unsubscribeToken);
        await prisma.user.update({
          where: { id: user.id },
          data: { lastSubscriptionReminderAt: new Date() },
        });
      } catch (e) {
        console.error("[subscriptionReminder] send failed for", user.id, e);
      }
    }
  } catch (e) {
    console.error("[subscriptionReminder] job error", e);
  }
}

let intervalId = null;

export function startSubscriptionReminderJob() {
  if (intervalId) return;
  runReminderJob();
  intervalId = setInterval(runReminderJob, INTERVAL_MS);
}

export function stopSubscriptionReminderJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
