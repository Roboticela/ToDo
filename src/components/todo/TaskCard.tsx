import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Timer,
  CalendarDays,
  Repeat,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Flag,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { Task } from "../../types/todo";
import { useTasks } from "../../contexts/TaskContext";
import { getTaskCompletionForDate } from "../../lib/taskService";
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

export default function TaskCard({ task, date, onEdit, onCompletionChange, staggerDelay = 0 }: TaskCardProps) {
  const { completeTask, uncompleteTask, deleteTask, skipTaskForDate, setTaskEndDate } = useTasks();
  const [isCompleted, setIsCompleted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    getTaskCompletionForDate(task, date).then(({ isCompleted: c }) => {
      setIsCompleted(c);
    });
  }, [task, date]);

  async function handleToggle() {
    if (isCompleted) {
      await uncompleteTask(task);
      setIsCompleted(false);
      onCompletionChange?.(false);
    } else {
      await completeTask(task);
      setIsCompleted(true);
      onCompletionChange?.(true);
    }
  }

  function handleDeleteClick() {
    setShowDeleteDialog(true);
  }

  async function handleDeleteConfirm(choice: DeleteChoice) {
    setIsDeleting(true);
    try {
      if (choice === "this_date") {
        await skipTaskForDate(task, date);
      } else if (choice === "future") {
        await setTaskEndDate(task, date);
      } else {
        await deleteTask(task.id);
      }
      setShowDeleteDialog(false);
    } catch {
      setIsDeleting(false);
    } finally {
      setIsDeleting(false);
    }
  }

  const isDoCategory = task.category === "do";

  const timeLabel = () => {
    if (task.type === "time-based" && task.time) return task.time;
    if (task.type === "duration" && task.startTime && task.endTime)
      return `${task.startTime} – ${task.endTime}`;
    return null;
  };

  const TypeIcon =
    task.type === "time-based" ? Clock : task.type === "duration" ? Timer : CalendarDays;

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDeleting ? 0 : 1, y: 0, scale: isDeleting ? 0.95 : 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ duration: 0.2, delay: isDeleting ? 0 : staggerDelay }}
      className={cn(
        "rounded-2xl border bg-card transition-all overflow-hidden",
        isCompleted ? "border-border/40 opacity-70" : "border-border",
        task.category === "do" && "border-l-2 border-l-green-400/60",
        task.category === "dont" && "border-l-2 border-l-orange-400/60"
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Completion toggle */}
          <motion.button
            type="button"
            onClick={handleToggle}
            whileTap={{ scale: 0.85 }}
            className={cn(
              "mt-0.5 flex-shrink-0 transition-colors",
              isCompleted ? "text-green-400" : isDoCategory ? "text-foreground/30 hover:text-primary/70" : "text-foreground/30 hover:text-orange-400/70"
            )}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Circle className="w-5 h-5" />
            )}
          </motion.button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium text-foreground leading-snug",
                    isCompleted && "line-through text-foreground/40"
                  )}
                >
                  {task.title}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {/* Type badge */}
                  <span className="inline-flex items-center gap-1 text-xs text-foreground/50">
                    <TypeIcon className="w-3 h-3" />
                    {timeLabel() || (task.type === "daily" ? "All day" : task.type)}
                  </span>

                  {/* Category badge */}
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
                  </span>

                  {/* Priority badge */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full",
                      (task.priority ?? "medium") === "high" && "bg-red-500/10 text-red-400",
                      (task.priority ?? "medium") === "medium" && "bg-amber-500/10 text-amber-400",
                      (task.priority ?? "medium") === "low" && "bg-slate-500/10 text-slate-400"
                    )}
                  >
                    <Flag className="w-3 h-3" />
                    {(task.priority ?? "medium").charAt(0).toUpperCase() + (task.priority ?? "medium").slice(1)}
                  </span>

                  {/* Repeat badge */}
                  {task.isRepeating && (
                    <span className="inline-flex items-center gap-1 text-xs text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <Repeat className="w-3 h-3" />
                      Weekly
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
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

        {/* Description expand */}
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

    <DeleteConfirmDialog
      isOpen={showDeleteDialog}
      onClose={() => setShowDeleteDialog(false)}
      task={task}
      date={date}
      onConfirm={handleDeleteConfirm}
      isDeleting={isDeleting}
    />
  </>
  );
}
