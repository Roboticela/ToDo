import type { NotificationSoundMode, User } from "../types/todo";
import { DEFAULT_LIBRARY_SOUND_ID } from "./soundCatalog";

/** Map a `/api/users/me` (or auth) JSON payload into the client User shape. */
export function mapUserFromApi(userData: Record<string, unknown>): User {
  const mode = userData.notificationSoundMode;
  let notificationSoundMode: NotificationSoundMode = "preset";
  if (mode === "custom") notificationSoundMode = "custom";
  else if (mode === "normal") notificationSoundMode = "normal";
  else if (mode === "ringtone" || mode === "preset") notificationSoundMode = "preset";

  const rawId =
    typeof userData.notificationSoundId === "string" ? userData.notificationSoundId : undefined;

  return {
    id: String(userData.id),
    name: String(userData.name ?? ""),
    email: String(userData.email ?? ""),
    avatarUrl: typeof userData.avatarUrl === "string" ? userData.avatarUrl : undefined,
    plan: (userData.plan as User["plan"]) ?? "free",
    planExpiresAt:
      typeof userData.planExpiresAt === "string" ? userData.planExpiresAt : undefined,
    emailVerifiedAt:
      typeof userData.emailVerifiedAt === "string" ? userData.emailVerifiedAt : undefined,
    subscribedToReminders: userData.subscribedToReminders !== false,
    taskNotificationsEnabled: userData.taskNotificationsEnabled !== false,
    notificationSoundMode,
    notificationSoundId:
      notificationSoundMode === "preset" ? rawId || DEFAULT_LIBRARY_SOUND_ID : rawId,
    customSoundUrl:
      typeof userData.customSoundUrl === "string" ? userData.customSoundUrl : undefined,
    hasPassword: userData.hasPassword === true,
    createdAt: String(userData.createdAt ?? new Date().toISOString()),
  };
}
