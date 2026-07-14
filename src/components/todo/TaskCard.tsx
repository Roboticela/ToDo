import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Timer,
  CalendarDays,
  Repeat,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Flag,
  Lock,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Task } from "../../types/todo";
import { useTasks } from "../../contexts/TaskContext";
import { useAuth } from "../../contexts/AuthContext";
import { getTaskCompletionForDate } from "../../lib/taskService";
import { formatTime, formatTimeRange } from "../../lib/timeFormat";
import { getTaskTimeLeft } from "../../lib/taskTimeLeft";
import DeleteConfirmDialog, { type DeleteChoice } from "./DeleteConfirmDialog";

interface TaskCardProps {
  task: Task;
  date: string;
  onEdit: (task: Task) => void;
  /** Called when the user toggles completion so the parent can update progress bar etc. */
  onCompletionChange?: (completed: boolean) => void;
  /** Optional delay for list stagger animation (e.g. index * 0.03) */
  staggerDelay?: number;
}

/** Returns true if the given date string (YYYY-MM-DD) is strictly before today (local). */
function isDateInPast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return d < today;
}

export default function TaskCard({ task, date, onEdit, onCompletionChange, staggerDelay = 0 }: TaskCardProps) {
  const { user } = useAuth();
  const { completeTask, uncompleteTask, deleteTask, skipTaskForDate, endRepeatingSeriesFromDate } = useTasks();
  const [isCompleted, setIsCompleted] = useState(false);
  // BUG-31: Track skipped state separately so we can style it distinctly from pending
  const [isSkipped, setIsSkipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // BUG-04: Surface delete errors to the user
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /** Past-day tasks are locked — no edits, deletes, or status changes allowed. */
  const isPastDay = isDateInPast(date);

  const timeFormat = user?.timeFormat === "24h" ? "24h" : "12h";
  const showCountdown = !isCompleted && (task.type === "time-based" || task.type === "duration");

  useEffect(() => {
    let cancelled = false;
    getTaskCompletionForDate(task, date).then(({ isCompleted: c, completionId }) => {
      if (!cancelled) {
        setIsCompleted((prev) => (prev === c ? prev : c));
        // BUG-31: Detect skipped completions so we can style them differently
        if (!c && completionId && task.isRepeating) {
          // completionId present + not completed => skipped
          setIsSkipped(true);
        } else {
          setIsSkipped(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- task fields listed below
  }, [task.id, task.status, task.updatedAt, task.completedAt, date]);

  useEffect(() => {
    if (!showCountdown) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [showCountdown, task.id, task.time, task.startTime, task.endTime, date]);

  // BUG-01: Pass the card's own `date` prop, not the context selectedDate
  async function handleToggle() {
    if (isPastDay) return; // locked
    if (isCompleted) {
      await uncompleteTask(task, date);
      setIsCompleted(false);
      setIsSkipped(false);
      onCompletionChange?.(false);
    } else {
      await completeTask(task, date);
      setIsCompleted(true);
      setIsSkipped(false);
      onCompletionChange?.(true);
    }
  }

  function handleDeleteClick() {
    if (isPastDay) return; // locked
    setShowDeleteDialog(true);
  }

  async function handleDeleteConfirm(choice: DeleteChoice) {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (choice === "this_date") {
        await skipTaskForDate(task, date);
      } else if (choice === "future") {
        await endRepeatingSeriesFromDate(task, date);
      } else {
        await deleteTask(task.id);
      }
    } catch (e) {
      // BUG-04: Surface the error so the user knows the delete failed
      setDeleteError(e instanceof Error ? e.message : "Failed to delete task. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  const timeLabel = () => {
    if (task.type === "time-based" && task.time) return formatTime(task.time, timeFormat);
    if (task.type === "duration" && task.startTime && task.endTime)
      return formatTimeRange(task.startTime, task.endTime, timeFormat);
    return null;
  };

  const timeLeft = showCountdown
    ? getTaskTimeLeft(task, date, new Date(now))
    : null;

  const TypeIcon =
    task.type === "time-based" ? Clock : task.type === "duration" ? Timer : CalendarDays;

  /**
   * Left-border colour:
   *  – Past day + completed  → green
   *  – Past day + incomplete → red
   *  – Today/future          → category colour (green for "do", orange for "dont")
   */
  const leftBorderClass = isPastDay
    ? isCompleted
      ? "border-l-4 border-l-green-500"
      : "border-l-4 border-l-red-500"
    : task.category === "do"
      ? "border-l-2 border-l-green-400/60"
      : "border-l-2 border-l-orange-400/60";

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDeleting ? 0 : 1, y: 0, scale: isDeleting ? 0.95 : 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ duration: 0.2, delay: isDeleting ? 0 : staggerDelay }}
      className={cn(
        "rounded-2xl border bg-card transition-all overflow-hidden",
        isPastDay && isCompleted && "border-border/40 opacity-80",
        isPastDay && !isCompleted && "border-red-500/30 opacity-75",
        !isPastDay && isCompleted && "border-border/40 opacity-70",
        !isPastDay && !isCompleted && "border-border",
        leftBorderClass
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Status icon — check (green) or X (red) for past-day; toggle button for current day */}
          {isPastDay ? (
            <div
              className={cn(
                "mt-0.5 flex-shrink-0",
                isCompleted ? "text-green-500" : "text-red-500"
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
            </div>
          ) : (
            <motion.button
              type="button"
              onClick={handleToggle}
              whileTap={{ scale: 0.85 }}
              className={cn(
                "mt-0.5 flex-shrink-0 transition-colors",
                isCompleted
                  ? task.category === "do"
                    ? "text-green-400"
                    : "text-orange-400"
                  : task.category === "do"
                    ? "text-foreground/30 hover:text-primary/70"
                    : "text-foreground/30 hover:text-orange-400/70"
              )}
              aria-label={
                isCompleted
                  ? task.category === "do"
                    ? "Mark as not done"
                    : "Mark as not avoided"
                  : task.category === "do"
                    ? "Mark as done"
                    : "Mark as avoided"
              }
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 opacity-20" />
              )}
            </motion.button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium text-foreground leading-snug",
                    isCompleted && "line-through text-foreground/40",
                    isPastDay && !isCompleted && "text-foreground/60"
                  )}
                >
                  {task.title}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-foreground/50">
                    <TypeIcon className="w-3 h-3" />
                    {timeLabel() || (task.type === "daily" ? "All day" : task.type)}
                  </span>

                  {timeLeft && (
                    <span
                      className={cn(
                        "inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full",
                        timeLeft.kind === "ends_in" ||
                          timeLeft.kind === "in" ||
                          timeLeft.kind === "starts_in"
                          ? "bg-primary/10 text-primary"
                          : "bg-foreground/5 text-foreground/45"
                      )}
                    >
                      {timeLeft.label}
                    </span>
                  )}

                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full",
                      task.category === "do"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-orange-500/10 text-orange-400"
                    )}
                  >
                    {task.category === "do" ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {task.category === "do" ? "Do" : "Don't"}
                    {isCompleted && (
                      <span className="opacity-80">
                        · {task.category === "do" ? "Done" : "Avoided"}
                      </span>
                    )}
                  </span>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full",
                      (task.priority ?? "medium") === "high" && "bg-red-500/10 text-red-400",
                      (task.priority ?? "medium") === "medium" && "bg-amber-500/10 text-amber-400",
                      (task.priority ?? "medium") === "low" && "bg-slate-500/10 text-slate-400"
                    )}
                  >
                    <Flag className="w-3 h-3" />
                    {(task.priority ?? "medium").charAt(0).toUpperCase() +
                      (task.priority ?? "medium").slice(1)}
                  </span>

                  {task.isRepeating && (() => {
                    // BUG-13: Dynamic repeat label instead of hardcoded "Weekly"
                    const days = task.repeatDays?.length ?? 0;
                    const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                    let repeatLabel = "Weekly";
                    if (days === 7) repeatLabel = "Daily";
                    else if (days === 5 && !task.repeatDays!.includes(0) && !task.repeatDays!.includes(6)) repeatLabel = "Weekdays";
                    else if (days === 1) repeatLabel = `${DAY_NAMES[task.repeatDays![0]]}s`;
                    return (
                      <span className="inline-flex items-center gap-1 text-xs text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded-full">
                        <Repeat className="w-3 h-3" />
                        {repeatLabel}
                      </span>
                    );
                  })()}

                  {/* BUG-31: Show amber "Skipped" badge when this occurrence was skipped */}
                  {isSkipped && !isCompleted && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                      Skipped
                    </span>
                  )}

                  {/* Past-day lock badge */}
                  {isPastDay && !isCompleted && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-400/80 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                      <Lock className="w-3 h-3" />
                      Missed
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {isPastDay ? (
                  /* Past-day: show a static lock icon instead of action buttons */
                  <div
                    className="p-1.5 rounded-lg text-foreground/20"
                    title="This day has passed — task is locked"
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <>
                    <motion.button
                      type="button"
                      onClick={() => onEdit(task)}
                      whileTap={{ scale: 0.85 }}
                      className="p-1.5 rounded-lg text-foreground/30 hover:text-primary/70 hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={handleDeleteClick}
                      whileTap={{ scale: 0.85 }}
                      className="p-1.5 rounded-lg text-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  </>
                )}
                {task.description && (
                  <motion.button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    whileTap={{ scale: 0.85 }}
                    className="p-1.5 rounded-lg text-foreground/30 hover:text-foreground/70 transition-colors"
                  >
                    <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </motion.div>
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {expanded && task.description && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-sm text-foreground/50 mt-3 pl-8 leading-relaxed">
                {task.description}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>

    {!isPastDay && (
      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        task={task}
        date={date}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    )}

    {/* BUG-04: Show delete error toast so user is informed when delete fails */}
    <AnimatePresence>
      {deleteError && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          onAnimationComplete={() => setTimeout(() => setDeleteError(null), 4000)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/95 text-white text-sm font-medium shadow-xl"
        >
          {deleteError}
        </motion.div>
      )}
    </AnimatePresence>
  </>
  );
}
