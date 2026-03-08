import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Clock, Timer, CalendarDays, TrendingUp, TrendingDown, Repeat } from "lucide-react";
import { cn } from "../../lib/utils";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import type { Task, TaskFormData, TaskType, TaskCategory, RepeatDay } from "../../types/todo";
import { useTasks } from "../../contexts/TaskContext";
import { getTodayString } from "../../lib/taskService";
import DatePicker from "./DatePicker";
import TimePicker from "./TimePicker";

const DAYS: { label: string; short: string; value: RepeatDay }[] = [
  { label: "Sunday", short: "Su", value: 0 },
  { label: "Monday", short: "Mo", value: 1 },
  { label: "Tuesday", short: "Tu", value: 2 },
  { label: "Wednesday", short: "We", value: 3 },
  { label: "Thursday", short: "Th", value: 4 },
  { label: "Friday", short: "Fr", value: 5 },
  { label: "Saturday", short: "Sa", value: 6 },
];

interface TaskFormProps {
  isOpen: boolean;
  onClose: () => void;
  editTask?: Task | null;
  defaultDate?: string;
}

export default function TaskForm({ isOpen, onClose, editTask, defaultDate }: TaskFormProps) {
  const isDesktop = useIsDesktop();
  const { createTask, updateTask } = useTasks();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>("daily");
  const [category, setCategory] = useState<TaskCategory>("do");
  const [date, setDate] = useState(defaultDate || getTodayString());
  const [time, setTime] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatDays, setRepeatDays] = useState<RepeatDay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editTask) {
      setTitle(editTask.title);
      setDescription(editTask.description || "");
      setType(editTask.type);
      setCategory(editTask.category);
      setDate(editTask.date);
      setTime(editTask.time || "");
      setStartTime(editTask.startTime || "");
      setEndTime(editTask.endTime || "");
      setIsRepeating(editTask.isRepeating);
      setRepeatDays(editTask.repeatDays);
    } else {
      setTitle("");
      setDescription("");
      setType("daily");
      setCategory("do");
      setDate(defaultDate || getTodayString());
      setTime("");
      setStartTime("");
      setEndTime("");
      setIsRepeating(false);
      setRepeatDays([]);
    }
    setErrors({});
  }, [editTask, defaultDate, isOpen]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "Title is required";
    if (type === "time-based" && !time) newErrors.time = "Time is required";
    if (type === "duration") {
      if (!startTime) newErrors.startTime = "Start time is required";
      if (!endTime) newErrors.endTime = "End time is required";
      if (startTime && endTime && startTime >= endTime)
        newErrors.endTime = "End time must be after start time";
    }
    if (isRepeating && repeatDays.length === 0)
      newErrors.repeatDays = "Select at least one day";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      const data: TaskFormData = {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        category,
        date,
        time: type === "time-based" ? time : undefined,
        startTime: type === "duration" ? startTime : undefined,
        endTime: type === "duration" ? endTime : undefined,
        isRepeating,
        repeatDays,
      };

      if (editTask) {
        await updateTask(editTask, data);
      } else {
        await createTask(data);
      }
      onClose();
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : "Failed to save task" });
    } finally {
      setIsLoading(false);
    }
  }

  function toggleRepeatDay(day: RepeatDay) {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  if (!isOpen) return null;

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Center wrapper on desktop */}
          <div className="fixed inset-0 z-50 pointer-events-none lg:flex lg:items-center lg:justify-center lg:p-4">
            {/* Sheet */}
            <motion.div
              initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
              animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
              exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
              transition={isDesktop ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 35 }}
              className={cn(
                "pointer-events-auto w-full max-w-2xl max-h-[92vh] lg:max-h-[90vh] overflow-hidden flex flex-col bg-card border border-border",
                "fixed bottom-0 left-0 right-0 mx-auto z-50 rounded-t-3xl border-t lg:relative lg:rounded-xl"
              )}
            >
            {/* Handle - hide on desktop */}
            <div className="flex justify-center pt-3 pb-1 shrink-0 lg:hidden">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-border/50">
              <h2 className="text-lg font-bold text-foreground">
                {editTask ? "Edit Task" : "New Task"}
              </h2>
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-xl text-foreground/40 hover:text-foreground/70 hover:bg-accent/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5"
            >
              {errors.submit && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {errors.submit}
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground/80">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What do you need to do?"
                  className={cn(
                    "w-full h-11 px-4 rounded-xl border bg-accent/20 text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all text-sm",
                    errors.title ? "border-red-500/50" : "border-border"
                  )}
                  autoFocus
                />
                {errors.title && <p className="text-xs text-red-400">{errors.title}</p>}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground/80">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional details..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-accent/20 text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all text-sm resize-none"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["do", "dont"] as TaskCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "flex items-center justify-center gap-2 h-11 rounded-xl border text-sm font-medium transition-all",
                        category === cat
                          ? cat === "do"
                            ? "bg-green-500/15 border-green-500/40 text-green-400"
                            : "bg-orange-500/15 border-orange-500/40 text-orange-400"
                          : "border-border text-foreground/50 hover:bg-accent/30"
                      )}
                    >
                      {cat === "do" ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      {cat === "do" ? "Do" : "Don't"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">Task Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "daily" as TaskType, label: "All Day", icon: CalendarDays },
                    { value: "time-based" as TaskType, label: "Timed", icon: Clock },
                    { value: "duration" as TaskType, label: "Duration", icon: Timer },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border text-xs font-medium transition-all",
                        type === value
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "border-border text-foreground/50 hover:bg-accent/30"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <DatePicker
                label="Date"
                value={date}
                onChange={setDate}
              />

              {/* Time fields */}
              <AnimatePresence>
                {type === "time-based" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <TimePicker
                      label="Time *"
                      value={time}
                      onChange={setTime}
                      error={errors.time}
                    />
                  </motion.div>
                )}

                {type === "duration" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-2 gap-3 overflow-hidden"
                  >
                    <TimePicker
                      label="Start Time *"
                      value={startTime}
                      onChange={setStartTime}
                      error={errors.startTime}
                    />
                    <TimePicker
                      label="End Time *"
                      value={endTime}
                      onChange={setEndTime}
                      error={errors.endTime}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Repeat */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-foreground/60" />
                    <label className="text-sm font-medium text-foreground/80">Weekly Repeat</label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRepeating(!isRepeating)}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-all duration-200 shrink-0",
                      isRepeating ? "bg-primary/20" : "bg-foreground/10"
                    )}
                  >
                    <motion.div
                      animate={{ x: isRepeating ? 20 : 2 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className={cn(
                        "absolute top-1 w-4 h-4 rounded-full shadow-sm transition-colors duration-200",
                        isRepeating ? "bg-primary" : "bg-foreground"
                      )}
                    />
                  </button>
                </div>

                <AnimatePresence>
                  {isRepeating && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex gap-1.5">
                        {DAYS.map(({ short, value }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleRepeatDay(value)}
                            className={cn(
                              "flex-1 h-9 rounded-xl text-xs font-semibold transition-all",
                              repeatDays.includes(value)
                                ? "bg-primary text-primary-foreground"
                                : "bg-accent/40 text-foreground/50 hover:bg-accent"
                            )}
                          >
                            {short}
                          </button>
                        ))}
                      </div>
                      {errors.repeatDays && (
                        <p className="text-xs text-red-400 mt-1">{errors.repeatDays}</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit */}
              <div className="pt-2 pb-safe">
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all",
                    isLoading ? "opacity-70 cursor-not-allowed" : "hover:bg-primary/90"
                  )}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Saving...
                    </span>
                  ) : editTask ? (
                    "Update Task"
                  ) : (
                    "Add Task"
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
