import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useAuth } from "../../contexts/AuthContext";
import { updateProfile, changePassword, deleteAccount } from "../../lib/authService";
import { PLAN_FEATURES } from "../../types/todo";

type ModalType = "edit-name" | "change-password" | "delete-account" | null;

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) return null;

  const plan = PLAN_FEATURES[user.plan];
  const planLabel = user.plan === "free" ? "Free" : user.plan === "basic" ? "$2/mo" : "$5/mo";

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    navigate("/auth/login", { replace: true });
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 w-full lg:max-w-5xl xl:max-w-6xl lg:mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-5 overflow-y-auto custom-scrollbar">
        {/* Avatar + Name */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3 py-4"
        >
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-primary/60" />
              )}
            </div>
            <button
              type="button"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">{user.name}</h2>
            <p className="text-sm text-foreground/50 mt-0.5">{user.email}</p>
          </div>

          {/* Plan badge */}
          <button
            type="button"
            onClick={() => navigate("/todo/subscription")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all hover:scale-105",
              user.plan === "free"
                ? "bg-accent/30 border-border text-foreground/60"
                : user.plan === "basic"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            )}
          >
            <Crown className="w-3.5 h-3.5" />
            {user.plan === "free" ? "Free Plan" : user.plan === "basic" ? "Basic Plan" : "Pro Plan"}
            {user.plan === "free" && <span className="text-xs text-primary/70 ml-1">Upgrade →</span>}
          </button>
        </motion.div>

        {/* Account section */}
        <Section label="Account">
          <SettingsRow
            icon={<User className="w-4 h-4 text-primary/70" />}
            label="Name"
            value={user.name}
            onClick={() => setActiveModal("edit-name")}
          />
          <SettingsRow
            icon={<Mail className="w-4 h-4 text-primary/70" />}
            label="Email"
            value={user.email}
          />
          <SettingsRow
            icon={<Lock className="w-4 h-4 text-primary/70" />}
            label="Change Password"
            onClick={() => setActiveModal("change-password")}
          />
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
            {user.plan !== "pro" && (
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
            icon={<LogOut className="w-4 h-4 text-foreground/50" />}
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

        <div className="text-center py-4">
          <p className="text-xs text-foreground/25">Roboticela ToDo · v0.1.0</p>
        </div>
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
                currentName={user.name}
                userId={user.id}
                onSave={(name) => { updateUser({ ...user, name }); setActiveModal(null); }}
                onClose={() => setActiveModal(null)}
              />
            )}
            {activeModal === "change-password" && (
              <ChangePasswordModal
                userId={user.id}
                onClose={() => setActiveModal(null)}
              />
            )}
            {activeModal === "delete-account" && (
              <DeleteAccountModal
                userId={user.id}
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
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm font-medium", danger && "text-red-400")}>{label}</span>
      </div>
      {value && <span className="text-xs text-foreground/40 truncate max-w-[120px]">{value}</span>}
      {onClick && !loading && <ChevronRight className="w-4 h-4 text-foreground/30 flex-shrink-0" />}
      {loading && (
        <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin flex-shrink-0" />
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

function ChangePasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
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
      await changePassword(userId, current, next);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("Failed to change password. Check your current password.");
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
          <PasswordInput label="Confirm New Password" value={confirm} onChange={setConfirm} show={showNext} onToggle={() => {}} />
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
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
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
    <div className="fixed inset-0 z-50 pointer-events-none lg:flex lg:items-center lg:justify-center lg:p-4">
      <motion.div
        initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
        animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
        exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
        transition={isDesktop ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 35 }}
        className={cn(
          "pointer-events-auto w-full max-w-2xl bg-card border border-border p-5",
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
