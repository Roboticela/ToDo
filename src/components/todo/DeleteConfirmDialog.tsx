"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, X, Calendar, CalendarX, Trash } from "lucide-react";
import type { Task } from "../../types/todo";
import { format } from "date-fns";

export type DeleteChoice = "this_date" | "future" | "entire";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  /** The date context (e.g. selected date when deleting from Today or Calendar). */
  date: string;
  onConfirm: (choice: DeleteChoice) => void;
  isDeleting?: boolean;
}

export default function DeleteConfirmDialog({
  isOpen,
  onClose,
  task,
  date,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (typeof window === "undefined") return null;

  const dateLabel = format(new Date(date + "T12:00:00"), "EEE, MMM d");
  const isRepeating = task.isRepeating;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/85 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.25, type: "spring", stiffness: 320, damping: 32 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      {isRepeating ? "Delete repeating task" : "Delete task"}
                    </h2>
                    <p className="text-sm text-foreground/50 truncate max-w-[200px]" title={task.title}>
                      {task.title}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="px-4 pb-4 space-y-4">
                {isRepeating ? (
                  <>
                    <p className="text-sm text-foreground/70">
                      This task repeats. What do you want to do?
                    </p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => onConfirm("this_date")}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-accent/30 hover:bg-accent/50 text-foreground text-left transition-colors disabled:opacity-50"
                      >
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <CalendarX className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <span className="font-medium block">Remove for this date only</span>
                          <span className="text-xs text-foreground/50">
                            Hide on {dateLabel} · past and future unchanged
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => onConfirm("future")}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-accent/30 hover:bg-accent/50 text-foreground text-left transition-colors disabled:opacity-50"
                      >
                        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 text-amber-500" />
                        </div>
                        <div>
                          <span className="font-medium block">Delete all future</span>
                          <span className="text-xs text-foreground/50">
                            Keep past · no more after {dateLabel}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => onConfirm("entire")}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-foreground text-left transition-colors disabled:opacity-50"
                      >
                        <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                          <Trash className="w-4 h-4 text-red-500" />
                        </div>
                        <div>
                          <span className="font-medium block text-red-600 dark:text-red-400">
                            Delete entirely
                          </span>
                          <span className="text-xs text-foreground/50">
                            Remove from all dates
                          </span>
                        </div>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-foreground/70">
                      This task will be permanently removed. This cannot be undone.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-border bg-accent/30 hover:bg-accent/50 text-foreground font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => onConfirm("entire")}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isDeleting ? (
                          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {isRepeating && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl border border-border text-foreground/70 font-medium hover:bg-accent/30 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
