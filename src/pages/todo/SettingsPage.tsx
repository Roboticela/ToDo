import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Lock,
  LogOut,
  Trash2,
  ChevronRight,
  Camera,
  Crown,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Check,
  Download,
  Upload,
  Bell,
  Volume2,
  Music,
  Play,
  Shield,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "../../lib/utils";
import { formatTime, nowLocalHhMm } from "../../lib/timeFormat";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useAuth } from "../../contexts/AuthContext";
import { useTasks } from "../../contexts/TaskContext";
import { useSync } from "../../contexts/SyncContext";
import { updateProfile, changePassword, deleteAccount, requestEmailChange } from "../../lib/authService";
import { saveUser } from "../../lib/db";
import { getApiBase } from "../../lib/apiBase";
import type { NotificationSoundMode, TimeFormat } from "../../types/todo";
import { getExportData, importTasksFromData } from "../../lib/taskService";
import { PLAN_FEATURES } from "../../types/todo";
import { getEffectiveClientPlan } from "../../lib/planLimits";
import { mapUserFromApi } from "../../lib/mapUserFromApi";
import {
  isNotificationSupported,
  requestNotificationPermission,
  rebuildNotificationsForUser,
  initNotificationScheduler,
} from "../../lib/notificationService";
import {
  prefetchCustomSound,
  clearCustomSoundCache,
} from "../../lib/notificationSound";
import { previewNotificationSound } from "../../lib/nativeNotification";
import { getOsKind } from "../../lib/platform";
import {
  SOUND_CATEGORIES,
  getCatalogSound,
  soundsByCategory,
  type SoundCategory,
} from "../../lib/soundCatalog";
import {
  getDesktopPrefs,
  setDesktopPrefs,
  isDesktopShell,
  type DesktopPrefs,
} from "../../lib/desktopPrefs";
import { getAppRuntime } from "../../lib/platform";
import {
  isNativePermissionGranted,
  getNotificationPermissionState,
} from "../../lib/nativeNotification";
import {
  isBackgroundServiceEnabledLocally,
  startReminderService,
  stopReminderService,
  ensureAndroidBackgroundPermissions,
  syncReminderSoundToNative,
} from "../../lib/reminderService";

type ModalType = "edit-name" | "edit-email" | "change-avatar" | "change-password" | "delete-account" | null;

function osSoundHint(): string {
  switch (getOsKind()) {
    case "windows":
      return "Windows Media";
    case "macos":
      return "macOS default";
    case "linux":
      return "Linux default";
    case "android":
      return "Android default";
    case "ios":
      return "iOS default";
    default:
      return "OS default";
  }
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, updateUser, logout, session, ensureFreshSession } = useAuth();
  const { refreshTasks } = useTasks();
  const { scheduleSync } = useSync();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [newsletterUpdating, setNewsletterUpdating] = useState(false);
  const [emailChangedSuccess, setEmailChangedSuccess] = useState(false);
  const [notifUpdating, setNotifUpdating] = useState(false);
  const [soundUploading, setSoundUploading] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !isNotificationSupported()) return "unsupported";
    return Notification.permission;
  });
  const [soundCategory, setSoundCategory] = useState<SoundCategory>("notifications");
  const [desktopPrefs, setDesktopPrefsState] = useState<DesktopPrefs | null>(null);
  const [desktopUpdating, setDesktopUpdating] = useState(false);
  const soundInputRef = useRef<HTMLInputElement>(null);
  const showDesktopSection = isDesktopShell();
  const runtime = getAppRuntime();
  const [backgroundServiceOn, setBackgroundServiceOn] = useState(false);
  const [backgroundServiceUpdating, setBackgroundServiceUpdating] = useState(false);
  const [batteryExemptionRequested, setBatteryExemptionRequested] = useState(false);

  useEffect(() => {
    if (runtime === "android") setBackgroundServiceOn(isBackgroundServiceEnabledLocally());
  }, [runtime]);

  // After email change confirmation (redirect from link), refetch user and clear param
  useEffect(() => {
    if (searchParams.get("email_changed") !== "1" || !session) return;
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/users/me`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (res.ok) {
          const userData = await res.json();
          const updatedUser = mapUserFromApi(userData);
          await saveUser(updatedUser);
          updateUser(updatedUser);
          setEmailChangedSuccess(true);
          setTimeout(() => setEmailChangedSuccess(false), 5000);
        }
      } finally {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("email_changed");
          return next;
        }, { replace: true });
      }
    })();
  }, [searchParams, session, updateUser, setSearchParams]);

  // Refresh profile so isAdmin / plan flags stay current for Settings UI
  useEffect(() => {
    if (!session?.accessToken || session.accessToken.startsWith("local_")) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await ensureFreshSession();
        const token = fresh?.accessToken || session.accessToken;
        const res = await fetch(`${getApiBase()}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const userData = await res.json();
        const updatedUser = mapUserFromApi(userData);
        await saveUser(updatedUser);
        if (!cancelled) updateUser(updatedUser);
      } catch {
        /* keep cached user */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, ensureFreshSession, updateUser]);

  // Keep custom ringtone cached locally for offline playback
  useEffect(() => {
    if (user?.customSoundUrl) {
      void prefetchCustomSound(user.customSoundUrl);
    }
  }, [user?.customSoundUrl]);

  // Open the category tab that matches the selected library sound
  useEffect(() => {
    const id = user?.notificationSoundId;
    const catalog = id ? getCatalogSound(id) : undefined;
    if (catalog) setSoundCategory(catalog.category);
  }, [user?.notificationSoundId]);

  // Load desktop tray prefs + sync permission state
  useEffect(() => {
    if (showDesktopSection) {
      void getDesktopPrefs().then(setDesktopPrefsState);
    }
    void isNativePermissionGranted().then((granted) => {
      if (granted) setPermission("granted");
      else setPermission(getNotificationPermissionState());
    });
  }, [showDesktopSection]);

  if (!user) return null;
  const currentUser = user;
  const rawMode = currentUser.notificationSoundMode ?? "preset";
  const soundMode: NotificationSoundMode =
    rawMode === "ringtone" ? "preset" : rawMode;
  const selectedSoundId =
    currentUser.notificationSoundId ||
    (soundMode === "preset" ? "notify-correct" : undefined);
  const selectedCatalog = getCatalogSound(selectedSoundId);
  const taskNotifsOn = currentUser.taskNotificationsEnabled !== false;
  const timeFormat: TimeFormat = currentUser.timeFormat === "24h" ? "24h" : "12h";

  async function handleTimeFormatChange(next: TimeFormat) {
    if (next === timeFormat) return;
    setNotifUpdating(true);
    try {
      const updated = await updateProfile(currentUser.id, { timeFormat: next });
      updateUser(updated);
    } finally {
      setNotifUpdating(false);
    }
  }

  async function handleNewsletterToggle() {
    const next = !(currentUser.subscribedToReminders ?? true);
    setNewsletterUpdating(true);
    try {
      const updated = await updateProfile(currentUser.id, { subscribedToReminders: next });
      updateUser(updated);
    } finally {
      setNewsletterUpdating(false);
    }
  }

  async function handleTaskNotifsToggle() {
    const next = !taskNotifsOn;
    setNotifUpdating(true);
    setSoundError(null);
    try {
      const updated = await updateProfile(currentUser.id, { taskNotificationsEnabled: next });
      updateUser(updated);
      if (next) {
        const granted = await requestNotificationPermission();
        setPermission(isNotificationSupported() ? Notification.permission : "unsupported");
        if (granted) await rebuildNotificationsForUser(currentUser.id);
      } else {
        await rebuildNotificationsForUser(currentUser.id);
      }
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : "Could not update notifications.");
    } finally {
      setNotifUpdating(false);
    }
  }

  async function handleBackgroundServiceToggle() {
    const next = !backgroundServiceOn;
    setBackgroundServiceUpdating(true);
    try {
      if (next) {
        await requestNotificationPermission();
        const ready = await startReminderService();
        await ensureAndroidBackgroundPermissions();
        setBackgroundServiceOn(true);
        await rebuildNotificationsForUser(currentUser.id);
        // Until exact alarms are granted, keep Schedule.at/timers as fallback.
        if (!ready) await initNotificationScheduler(currentUser.id);
      } else {
        await stopReminderService();
        setBackgroundServiceOn(false);
        await initNotificationScheduler(currentUser.id);
      }
    } finally {
      setBackgroundServiceUpdating(false);
    }
  }

  async function handleRequestBatteryExemption() {
    await ensureAndroidBackgroundPermissions();
    setBatteryExemptionRequested(true);
  }

  async function handleEnablePermission() {
    const granted = await requestNotificationPermission();
    setPermission(isNotificationSupported() ? Notification.permission : "unsupported");
    if (granted && taskNotifsOn) {
      await rebuildNotificationsForUser(currentUser.id);
    }
  }

  async function applySoundToNotifications(userAfter: typeof currentUser, force = false) {
    await syncReminderSoundToNative(userAfter, { force });
    if (taskNotifsOn) {
      await rebuildNotificationsForUser(userAfter.id);
    }
  }

  async function handleSoundModeChange(mode: NotificationSoundMode) {
    if (mode === soundMode && mode !== "preset") return;
    if (mode === "custom" && !currentUser.customSoundUrl) {
      soundInputRef.current?.click();
      return;
    }
    setNotifUpdating(true);
    setSoundError(null);
    try {
      const patch: Partial<typeof currentUser> = { notificationSoundMode: mode };
      if (mode === "preset" && !currentUser.notificationSoundId) {
        patch.notificationSoundId = "notify-correct";
      }
      const updated = await updateProfile(currentUser.id, patch);
      updateUser(updated);
      await applySoundToNotifications(updated, true);
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : "Could not update sound.");
    } finally {
      setNotifUpdating(false);
    }
  }

  async function handleSelectCatalogSound(soundId: string) {
    setNotifUpdating(true);
    setSoundError(null);
    try {
      const updated = await updateProfile(currentUser.id, {
        notificationSoundMode: "preset",
        notificationSoundId: soundId,
      });
      updateUser(updated);
      await applySoundToNotifications(updated, true);
      await previewNotificationSound({ mode: "preset", soundId });
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : "Could not update sound.");
    } finally {
      setNotifUpdating(false);
    }
  }

  async function handleSoundFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setSoundError("Please choose an audio file (MP3, WAV, OGG, or M4A).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSoundError("Sound must be under 2MB.");
      return;
    }
    setSoundUploading(true);
    setSoundError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const previousUrl = currentUser.customSoundUrl;
      const updated = await updateProfile(currentUser.id, {
        customSoundUrl: dataUrl,
        notificationSoundMode: "custom",
      });
      updateUser(updated);
      if (previousUrl && previousUrl !== updated.customSoundUrl) {
        await clearCustomSoundCache(previousUrl);
      }
      if (updated.customSoundUrl) {
        await prefetchCustomSound(updated.customSoundUrl);
      }
      await applySoundToNotifications(updated, true);
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : "Sound upload failed.");
    } finally {
      setSoundUploading(false);
    }
  }

  async function handleRemoveCustomSound() {
    setSoundUploading(true);
    setSoundError(null);
    try {
      const previousUrl = currentUser.customSoundUrl;
      const updated = await updateProfile(currentUser.id, {
        customSoundUrl: "",
        notificationSoundMode: soundMode === "custom" ? "preset" : soundMode,
        ...(soundMode === "custom" ? { notificationSoundId: "notify-correct" } : {}),
      });
      updateUser(updated);
      if (previousUrl) await clearCustomSoundCache(previousUrl);
      await applySoundToNotifications(updated, true);
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : "Could not remove sound.");
    } finally {
      setSoundUploading(false);
    }
  }

  async function handlePreviewSound() {
    setSoundError(null);
    try {
      await previewNotificationSound({
        mode: soundMode,
        customSoundUrl: currentUser.customSoundUrl,
        soundId: selectedSoundId,
      });
    } catch {
      setSoundError("Could not play preview.");
    }
  }

  async function handleDesktopPrefToggle(key: keyof DesktopPrefs) {
    if (!desktopPrefs) return;
    setDesktopUpdating(true);
    try {
      const next = { ...desktopPrefs, [key]: !desktopPrefs[key] };
      // Hiding tray while minimize-to-tray is on would trap the user — turn minimize off
      if (key === "showTrayIcon" && !next.showTrayIcon) {
        next.minimizeToTray = false;
      }
      const saved = await setDesktopPrefs(next);
      setDesktopPrefsState(saved);
    } catch (err) {
      setSoundError(err instanceof Error ? err.message : "Could not update desktop settings.");
    } finally {
      setDesktopUpdating(false);
    }
  }

  const effectivePlan =
    currentUser.plan === "pending"
      ? "free"
      : getEffectiveClientPlan(currentUser.plan, currentUser.planExpiresAt);
  const plan = PLAN_FEATURES[effectivePlan];
  const planLabel =
    effectivePlan === "free"
      ? "Free"
      : effectivePlan === "basic"
        ? "$5/mo"
        : effectivePlan === "pro"
          ? "$8/mo"
          : "Lifetime";

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    navigate("/auth/login", { replace: true });
  }

  async function handleExport() {
    setExportLoading(true);
    setImportMessage(null);
    try {
      const data = await getExportData(currentUser.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roboticela-todo-export-${format(new Date(), "yyyy-MM-dd")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  }

  function handleImportClick() {
    setImportMessage(null);
    importInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportLoading(true);
    setImportMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      const count = Array.isArray((data as { tasks?: unknown[] }).tasks) ? (data as { tasks: unknown[] }).tasks.length : 0;
      if (count === 0) {
        setImportMessage("No tasks found in file.");
        return;
      }
      if (!window.confirm(`Import ${count} task${count === 1 ? "" : "s"}? They will be added to your account.`)) {
        return;
      }
      const result = await importTasksFromData(
        currentUser.id,
        data,
        currentUser.plan,
        currentUser.planExpiresAt
      );
      await refreshTasks();
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      if (result.errors.length > 0) {
        setImportMessage(`Imported ${result.imported} task(s). ${result.errors.length} error(s): ${result.errors.slice(0, 3).join("; ")}${result.errors.length > 3 ? "…" : ""}`);
      } else {
        setImportMessage(`Imported ${result.imported} task(s) successfully.`);
      }
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Invalid or corrupted export file.");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      {emailChangedSuccess && (
        <div className="flex-shrink-0 mx-4 mt-2 mb-1 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium text-center">
          Email updated successfully. Your new address is verified.
        </div>
      )}
      <div className="flex-1 w-full lg:max-w-5xl xl:max-w-6xl lg:mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-5 overflow-y-auto custom-scrollbar">
        {/* Avatar + Name */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 py-4"
        >
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-10 h-10 text-primary/60" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setActiveModal("change-avatar")}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">{currentUser.name}</h2>
            <p className="text-sm text-foreground/50 mt-0.5">{currentUser.email}</p>
          </div>

          {/* Plan badge */}
          <button
            type="button"
            onClick={() => navigate("/todo/subscription")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all hover:scale-105",
              effectivePlan === "free"
                ? "bg-accent/30 border-border text-foreground/60"
                : effectivePlan === "basic"
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  : effectivePlan === "lifetime"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            )}
          >
            <Crown className="w-3.5 h-3.5" />
            {effectivePlan === "free"
              ? "Free Plan"
              : effectivePlan === "basic"
                ? "Basic Plan"
                : effectivePlan === "lifetime"
                  ? "Lifetime Plan"
                  : "Pro Plan"}
            {effectivePlan === "free" && <span className="text-xs text-primary/70 ml-1">Upgrade →</span>}
          </button>
        </motion.div>

        {/* Account section */}
        <Section label="Account">
          <SettingsRow
            icon={<User className="w-4 h-4 text-primary/70" />}
            label="Name"
            value={currentUser.name}
            onClick={() => setActiveModal("edit-name")}
          />
          <SettingsRow
            icon={<Mail className="w-4 h-4 text-primary/70" />}
            label="Email"
            value={currentUser.email}
            onClick={() => setActiveModal("edit-email")}
          />
          {currentUser.hasPassword === true && (
            <SettingsRow
              icon={<Lock className="w-4 h-4 text-primary/70" />}
              label="Change Password"
              onClick={() => setActiveModal("change-password")}
            />
          )}
        </Section>

        {currentUser.isAdmin && (
          <Section label="Admin">
            <SettingsRow
              icon={<Shield className="w-4 h-4 text-primary/70" />}
              label="Admin Dashboard"
              value="Manage users & data"
              onClick={() => navigate("/admin")}
            />
          </Section>
        )}

        {/* Display preferences */}
        <Section label="Display">
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary/70 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Time format</p>
                <p className="text-xs text-foreground/50 mt-0.5">
                  How times appear on tasks and pickers
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "12h" as const,
                    label: "12-hour",
                    hint: formatTime(nowLocalHhMm(), "12h"),
                  },
                  {
                    id: "24h" as const,
                    label: "24-hour",
                    hint: formatTime(nowLocalHhMm(), "24h"),
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={notifUpdating}
                  onClick={() => handleTimeFormatChange(opt.id)}
                  className={cn(
                    "rounded-xl border px-2 py-2.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                    timeFormat === opt.id
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border bg-accent/10 text-foreground/70 hover:bg-accent/25",
                    notifUpdating && "opacity-70 cursor-not-allowed"
                  )}
                >
                  <p className="text-xs font-semibold">{opt.label}</p>
                  <p className="text-[10px] text-foreground/45 mt-0.5">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Task notifications */}
        <Section label="Notifications">
          <input
            ref={soundInputRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/aac,audio/x-m4a,audio/webm,.mp3,.wav,.ogg,.m4a"
            className="hidden"
            onChange={handleSoundFile}
          />
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0">
                <Bell className="w-4 h-4 text-primary/70" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Task reminders</p>
                <p className="text-xs text-foreground/50 mt-0.5">
                  {taskNotifsOn
                    ? soundMode === "normal"
                      ? `Uses your device’s default sound (${osSoundHint()}).`
                      : soundMode === "custom"
                        ? "Uses your uploaded custom sound for reminders."
                        : `Uses “${selectedCatalog?.name ?? "library"}” from the sound library.`
                    : "Task reminders are off."}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={taskNotifsOn}
              disabled={notifUpdating}
              onClick={handleTaskNotifsToggle}
              className={cn(
                "relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background",
                taskNotifsOn ? "bg-primary/20" : "bg-foreground/10",
                notifUpdating && "opacity-70 cursor-not-allowed"
              )}
            >
              <motion.div
                animate={{ x: taskNotifsOn ? 20 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={cn(
                  "absolute top-1 w-4 h-4 rounded-full shadow-sm transition-colors duration-200",
                  taskNotifsOn ? "bg-primary" : "bg-foreground"
                )}
              />
            </button>
          </div>

          {taskNotifsOn && (
            <>
              {permission !== "granted" && permission !== "unsupported" && (
                <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-3">
                  <p className="text-xs text-foreground/60 min-w-0">
                    {permission === "denied"
                      ? "Browser blocked notifications. Enable them in site settings."
                      : "Allow notifications so reminders can appear."}
                  </p>
                  {permission !== "denied" && (
                    <button
                      type="button"
                      onClick={handleEnablePermission}
                      className="shrink-0 text-xs font-semibold text-primary hover:text-primary/80"
                    >
                      Allow
                    </button>
                  )}
                </div>
              )}

              <div className="px-4 py-3 space-y-4">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary/70 shrink-0" />
                  <p className="text-sm font-medium text-foreground">Alert sound</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: "normal" as const,
                        label: "Normal",
                        hint: osSoundHint(),
                      },
                      {
                        id: "preset" as const,
                        label: "Library",
                        hint: selectedCatalog?.name ?? "Pick a tone",
                      },
                      { id: "custom" as const, label: "Custom", hint: "Your file" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={notifUpdating || soundUploading}
                      onClick={() => handleSoundModeChange(opt.id)}
                      className={cn(
                        "rounded-xl border px-2 py-2.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                        soundMode === opt.id
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-accent/10 text-foreground/70 hover:bg-accent/25"
                      )}
                    >
                      <p className="text-xs font-semibold">{opt.label}</p>
                      <p className="text-[10px] text-foreground/45 mt-0.5 truncate">{opt.hint}</p>
                    </button>
                  ))}
                </div>

                {soundMode === "preset" && (
                  <div className="space-y-3 rounded-2xl border border-border/60 bg-gradient-to-b from-accent/20 to-transparent p-3">
                    <div className="flex gap-1.5 p-1 rounded-xl bg-background/50 border border-border/40">
                      {SOUND_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSoundCategory(cat.id)}
                          className={cn(
                            "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
                            soundCategory === cat.id
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-foreground/60 hover:text-foreground hover:bg-accent/40"
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-foreground/50 px-0.5">
                      {SOUND_CATEGORIES.find((c) => c.id === soundCategory)?.blurb}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
                      {soundsByCategory(soundCategory).map((sound) => {
                        const active = selectedSoundId === sound.id;
                        return (
                          <motion.button
                            key={sound.id}
                            type="button"
                            whileTap={{ scale: 0.98 }}
                            disabled={notifUpdating}
                            onClick={() => handleSelectCatalogSound(sound.id)}
                            className={cn(
                              "text-left rounded-xl border px-3 py-2.5 transition-all",
                              active
                                ? "border-primary/60 bg-primary/15"
                                : "border-border/70 bg-background/40 hover:border-primary/30 hover:bg-accent/25"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">
                                  {sound.name}
                                </p>
                                <p className="text-[10px] text-foreground/50 mt-0.5 leading-snug">
                                  {sound.blurb}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center",
                                  active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border text-foreground/40"
                                )}
                              >
                                {active ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3 h-3" />
                                )}
                              </span>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {soundMode === "custom" && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-foreground/50">
                      {currentUser.customSoundUrl
                        ? "Custom sound saved to the cloud and cached on this device."
                        : "Upload an MP3, WAV, OGG, or M4A (max 2MB)."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={soundUploading}
                        onClick={() => soundInputRef.current?.click()}
                        className="h-9 px-3 rounded-xl border border-border text-xs font-medium text-foreground/80 hover:bg-accent/30 transition-colors inline-flex items-center gap-1.5"
                      >
                        <Music className="w-3.5 h-3.5" />
                        {soundUploading
                          ? "Uploading…"
                          : currentUser.customSoundUrl
                            ? "Replace sound"
                            : "Upload sound"}
                      </motion.button>
                      {currentUser.customSoundUrl && (
                        <button
                          type="button"
                          disabled={soundUploading}
                          onClick={handleRemoveCustomSound}
                          className="h-9 px-3 rounded-xl border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePreviewSound}
                  disabled={soundMode === "custom" && !currentUser.customSoundUrl}
                  className="h-9 px-3 rounded-xl border border-border text-xs font-medium text-foreground/80 hover:bg-accent/30 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Preview sound
                </button>
              </div>
            </>
          )}

          {soundError && (
            <p className="px-4 py-2 text-xs text-red-400 border-t border-border/50">{soundError}</p>
          )}
        </Section>

        {showDesktopSection && desktopPrefs && (
          <Section label="Desktop">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Launch at startup</p>
                <p className="text-xs text-foreground/50 mt-0.5">
                  Open ToDo automatically when you sign in to your computer.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={desktopPrefs.launchAtStartup}
                disabled={desktopUpdating}
                onClick={() => handleDesktopPrefToggle("launchAtStartup")}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40",
                  desktopPrefs.launchAtStartup ? "bg-primary/20" : "bg-foreground/10"
                )}
              >
                <motion.div
                  animate={{ x: desktopPrefs.launchAtStartup ? 20 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full shadow-sm",
                    desktopPrefs.launchAtStartup ? "bg-primary" : "bg-foreground"
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Show in system tray</p>
                <p className="text-xs text-foreground/50 mt-0.5">
                  Keep an icon in the notification area for background reminders.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={desktopPrefs.showTrayIcon}
                disabled={desktopUpdating}
                onClick={() => handleDesktopPrefToggle("showTrayIcon")}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40",
                  desktopPrefs.showTrayIcon ? "bg-primary/20" : "bg-foreground/10"
                )}
              >
                <motion.div
                  animate={{ x: desktopPrefs.showTrayIcon ? 20 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full shadow-sm",
                    desktopPrefs.showTrayIcon ? "bg-primary" : "bg-foreground"
                  )}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Minimize to tray on close</p>
                <p className="text-xs text-foreground/50 mt-0.5">
                  {desktopPrefs.showTrayIcon
                    ? "Closing the window keeps the app running in the background."
                    : "Enable the tray icon to use this option."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={desktopPrefs.minimizeToTray}
                disabled={desktopUpdating || !desktopPrefs.showTrayIcon}
                onClick={() => handleDesktopPrefToggle("minimizeToTray")}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40",
                  desktopPrefs.minimizeToTray && desktopPrefs.showTrayIcon
                    ? "bg-primary/20"
                    : "bg-foreground/10",
                  !desktopPrefs.showTrayIcon && "opacity-50 cursor-not-allowed"
                )}
              >
                <motion.div
                  animate={{
                    x: desktopPrefs.minimizeToTray && desktopPrefs.showTrayIcon ? 20 : 2,
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full shadow-sm",
                    desktopPrefs.minimizeToTray && desktopPrefs.showTrayIcon
                      ? "bg-primary"
                      : "bg-foreground"
                  )}
                />
              </button>
            </div>
            <p className="px-4 py-2 text-[11px] text-foreground/45 border-t border-border/50">
              Quit from the tray menu when you want to fully exit. Left-click the tray icon to reopen.
            </p>
          </Section>
        )}

        {runtime === "android" && (
          <Section label="Background">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0">
                  <Shield className="w-4 h-4 text-primary/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Reminders when the app is closed</p>
                  <p className="text-xs text-foreground/50 mt-0.5 leading-relaxed">
                    {backgroundServiceOn
                      ? "Android will wake ToDo briefly for each reminder (exact alarms). Allow notifications, exact alarms, and battery exemption when prompted."
                      : "Off: reminders rely on system scheduling only and may be less reliable after you close the app."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={backgroundServiceOn}
                disabled={backgroundServiceUpdating}
                onClick={handleBackgroundServiceToggle}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background",
                  backgroundServiceOn ? "bg-primary/20" : "bg-foreground/10",
                  backgroundServiceUpdating && "opacity-70 cursor-not-allowed"
                )}
              >
                <motion.div
                  animate={{ x: backgroundServiceOn ? 20 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full shadow-sm transition-colors duration-200",
                    backgroundServiceOn ? "bg-primary" : "bg-foreground"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Allow exact alarms &amp; battery</p>
                <p className="text-xs text-foreground/50 mt-0.5 leading-relaxed">
                  {batteryExemptionRequested
                    ? "If Android showed settings screens, turn on Alarms &amp; reminders and Allow unrestricted battery."
                    : "Required so reminders still fire after you swipe the app away. Opens Android settings when needed."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestBatteryExemption}
                className="shrink-0 rounded-xl border border-border/70 bg-accent/10 px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-accent/25 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                Allow
              </button>
            </div>

            <p className="px-4 py-2 text-[11px] text-foreground/45 border-t border-border/50 leading-relaxed">
              After enabling, grant notification permission, Alarms &amp; reminders, and unrestricted battery.
              Then you can close the app completely and reminders will still fire.
            </p>
          </Section>
        )}

        {/* Newsletter / Email preferences */}
        <Section label="Newsletter">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0">
                <Mail className="w-4 h-4 text-primary/70" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Subscription reminders & tips</p>
                <p className="text-xs text-foreground/50 mt-0.5">
                  {currentUser.subscribedToReminders !== false ? "You receive occasional emails." : "You're unsubscribed."}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={currentUser.subscribedToReminders !== false}
              disabled={newsletterUpdating}
              onClick={handleNewsletterToggle}
              className={cn(
                "relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background",
                currentUser.subscribedToReminders !== false ? "bg-primary/20" : "bg-foreground/10",
                newsletterUpdating && "opacity-70 cursor-not-allowed"
              )}
            >
              <motion.div
                animate={{ x: currentUser.subscribedToReminders !== false ? 20 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={cn(
                  "absolute top-1 w-4 h-4 rounded-full shadow-sm transition-colors duration-200",
                  currentUser.subscribedToReminders !== false ? "bg-primary" : "bg-foreground"
                )}
              />
            </button>
          </div>
        </Section>

        {/* Data: Export / Import */}
        <Section label="Data">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <SettingsRow
            icon={<Download className="w-4 h-4 text-primary/70" />}
            label="Export tasks"
            value={exportLoading ? "Exporting…" : undefined}
            onClick={handleExport}
            loading={exportLoading}
          />
          <SettingsRow
            icon={<Upload className="w-4 h-4 text-primary/70" />}
            label="Import tasks"
            value={importLoading ? "Importing…" : undefined}
            onClick={handleImportClick}
            loading={importLoading}
          />
          {importMessage && (
            <p className="px-4 py-2 text-xs text-foreground/70 border-t border-border/50">{importMessage}</p>
          )}
        </Section>

        {/* Plan section */}
        <Section label="Subscription">
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/70">Current Plan</span>
              <span className="text-sm font-semibold text-foreground">{planLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/70">History</span>
              <span className="text-sm text-foreground/60">
                {plan.historyDays === null ? "Unlimited" : `${plan.historyDays} days`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/70">Repeat Tasks</span>
              <span className="text-sm text-foreground/60">
                {plan.maxRepeatTasks === null ? "Unlimited" : `Max ${plan.maxRepeatTasks}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/70">Daily Tasks</span>
              <span className="text-sm text-foreground/60">
                {plan.maxDailyTasks === null ? "Unlimited" : `Max ${plan.maxDailyTasks}/day`}
              </span>
            </div>
            {effectivePlan !== "pro" && effectivePlan !== "lifetime" && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate("/todo/subscription")}
                className="w-full mt-2 h-10 rounded-xl bg-primary/15 text-primary text-sm font-semibold hover:bg-primary/25 transition-colors"
              >
                Upgrade Plan
              </motion.button>
            )}
          </div>
        </Section>

        {/* Danger zone */}
        <Section label="Account Actions">
          <SettingsRow
            icon={<LogOut className="w-4 h-4 text-red-400" />}
            label="Sign Out"
            onClick={handleLogout}
            loading={isLoggingOut}
            danger
          />
          <SettingsRow
            icon={<Trash2 className="w-4 h-4 text-red-400" />}
            label="Delete Account"
            onClick={() => setActiveModal("delete-account")}
            danger
          />
        </Section>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setActiveModal(null)}
            />
            {activeModal === "edit-name" && (
              <EditNameModal
                currentName={currentUser.name}
                userId={currentUser.id}
                onSave={(name) => { updateUser({ ...currentUser, name }); setActiveModal(null); }}
                onClose={() => setActiveModal(null)}
              />
            )}
            {activeModal === "edit-email" && (
              <EditEmailModal
                currentEmail={currentUser.email}
                userId={currentUser.id}
                onSave={(email) => { updateUser({ ...currentUser, email }); setActiveModal(null); }}
                onClose={() => setActiveModal(null)}
              />
            )}
            {activeModal === "change-avatar" && (
              <ChangeAvatarModal
                currentAvatarUrl={currentUser.avatarUrl}
                userId={currentUser.id}
                onSave={(avatarUrl) => { updateUser({ ...currentUser, avatarUrl }); setActiveModal(null); }}
                onClose={() => setActiveModal(null)}
              />
            )}
            {activeModal === "change-password" && (
              <ChangePasswordModal
                userId={currentUser.id}
                onClose={() => setActiveModal(null)}
              />
            )}
            {activeModal === "delete-account" && (
              <DeleteAccountModal
                userId={currentUser.id}
                onDeleted={() => { logout(); navigate("/auth/login", { replace: true }); }}
                onClose={() => setActiveModal(null)}
              />
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-1"
    >
      <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider px-1 mb-2">
        {label}
      </p>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/50">
        {children}
      </div>
    </motion.div>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  onClick,
  loading,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || loading}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors",
        onClick && "hover:bg-accent/30 active:bg-accent/50",
        !onClick && "cursor-default"
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm font-medium", danger && "text-red-400")}>{label}</span>
      </div>
      {value && <span className="text-xs text-foreground/40 truncate max-w-[120px]">{value}</span>}
      {onClick && !loading && <ChevronRight className="w-4 h-4 text-foreground/30 shrink-0" />}
      {loading && (
        <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin shrink-0" />
      )}
    </button>
  );
}

function EditNameModal({
  currentName,
  userId,
  onSave,
  onClose,
}: {
  currentName: string;
  userId: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setIsLoading(true);
    try {
      const updated = await updateProfile(userId, { name: name.trim() });
      onSave(updated.name);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <BottomSheet title="Edit Name" onClose={onClose}>
      <div className="space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-11 px-4 rounded-xl border border-border bg-accent/20 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
          autoFocus
        />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground/70 hover:bg-accent/30 transition-colors">
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !name.trim()}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isLoading ? "Saving..." : "Save"}
          </motion.button>
        </div>
      </div>
    </BottomSheet>
  );
}

function EditEmailModal({
  currentEmail,
  userId: _userId,
  onSave,
  onClose,
}: {
  currentEmail: string;
  userId: string;
  onSave: (email: string) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(currentEmail);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSave() {
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter your new email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    if (trimmed !== confirmEmail.trim().toLowerCase()) {
      setError("Emails do not match");
      return;
    }
    if (trimmed === currentEmail) {
      onClose();
      return;
    }
    setIsLoading(true);
    try {
      await requestEmailChange(trimmed);
      onSave(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send confirmation email.");
    } finally {
      setIsLoading(false);
    }
  }

  if (sentTo) {
    return (
      <BottomSheet title="Check your email" onClose={onClose}>
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-foreground/80 text-center">
              We sent a confirmation link to <strong>{sentTo}</strong>. Click the link in that email to complete the change. The link expires in 1 hour.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title="Change Email" onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 text-red-400 text-xs border border-red-500/20">
            {error}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground/60">New email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full h-11 px-4 rounded-xl border border-border bg-accent/20 text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground/60">Confirm new email</label>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full h-11 px-4 rounded-xl border border-border bg-accent/20 text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
            autoComplete="email"
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground/70 hover:bg-accent/30 transition-colors">
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !email.trim() || !confirmEmail.trim()}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isLoading ? "Sending…" : "Send verification link"}
          </motion.button>
        </div>
      </div>
    </BottomSheet>
  );
}

function ChangeAvatarModal({
  currentAvatarUrl,
  userId,
  onSave,
  onClose,
}: {
  currentAvatarUrl?: string;
  userId: string;
  onSave: (avatarUrl: string | undefined) => void;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setError("");
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setIsLoading(true);
      try {
        const updated = await updateProfile(userId, { avatarUrl: dataUrl });
        onSave(updated.avatarUrl);
        onClose();
      } catch {
        setError("Failed to update photo.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleRemove() {
    setIsLoading(true);
    setError("");
    try {
      const updated = await updateProfile(userId, { avatarUrl: "" });
      onSave(updated.avatarUrl);
      onClose();
    } catch {
      setError("Failed to remove photo.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <BottomSheet title="Change Photo" onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 text-red-400 text-xs border border-red-500/20">
            {error}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <motion.button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          whileTap={{ scale: 0.98 }}
          className="w-full h-11 rounded-xl border border-border text-sm font-medium text-foreground/80 hover:bg-accent/30 transition-colors flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" />
          {isLoading ? "Saving..." : "Choose image from device"}
        </motion.button>
        {currentAvatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isLoading}
            className="w-full h-11 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
          >
            Remove photo
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-xl border border-border text-sm font-medium text-foreground/70 hover:bg-accent/30 transition-colors"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}

function ChangePasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!current || !next || !confirm) { setError("Fill in all fields"); return; }
    if (next !== confirm) { setError("Passwords don't match"); return; }
    if (next.length < 6) { setError("Password must be at least 6 characters"); return; }
    setIsLoading(true);
    setError("");
    try {
      await changePassword(userId, next, current);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <BottomSheet title="Change Password" onClose={onClose}>
      {success ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-sm font-medium text-foreground">Password changed!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-400 text-xs border border-red-500/20">{error}</div>}
          <PasswordInput label="Current Password" value={current} onChange={setCurrent} show={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />
          <PasswordInput label="New Password" value={next} onChange={setNext} show={showNext} onToggle={() => setShowNext(!showNext)} />
          <PasswordInput label="Confirm New Password" value={confirm} onChange={setConfirm} show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground/70 hover:bg-accent/30 transition-colors">
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={handleSave}
              disabled={isLoading}
              whileTap={{ scale: 0.97 }}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isLoading ? "Saving..." : "Update"}
            </motion.button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function PasswordInput({
  label, value, onChange, show, onToggle,
}: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground/60">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 pl-4 pr-10 rounded-xl border border-border bg-accent/20 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function DeleteAccountModal({
  userId, onDeleted, onClose,
}: {
  userId: string; onDeleted: () => void; onClose: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleDelete() {
    if (confirm !== "DELETE") return;
    setIsLoading(true);
    try {
      await deleteAccount(userId);
      onDeleted();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <BottomSheet title="Delete Account" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">
            This action is irreversible. All your tasks and data will be permanently deleted.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground/60">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full h-11 px-4 rounded-xl border border-border bg-accent/20 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm"
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-medium hover:bg-accent/30 transition-colors">
            Cancel
          </button>
          <motion.button
            type="button"
            onClick={handleDelete}
            disabled={confirm !== "DELETE" || isLoading}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40 transition-colors"
          >
            {isLoading ? "Deleting..." : "Delete Account"}
          </motion.button>
        </div>
      </div>
    </BottomSheet>
  );
}

function BottomSheet({
  title, onClose, children,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  const isDesktop = useIsDesktop();
  return (
    <div className="fixed inset-0 z-50 lg:flex lg:items-center lg:justify-center lg:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
        animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
        exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
        transition={isDesktop ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 35 }}
        className={cn(
          "w-full max-w-2xl bg-card border border-border p-5",
          "fixed bottom-0 left-0 right-0 mx-auto z-50 rounded-t-3xl border-t lg:relative lg:rounded-xl lg:max-h-[90vh] lg:overflow-y-auto"
        )}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground/70 hover:bg-accent/50">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
