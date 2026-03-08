import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ChevronLeft, ChevronRight, CheckCircle2, List, TrendingUp, TrendingDown } from "lucide-react";
import { format, addDays, subDays, parseISO } from "date-fns";
import { cn } from "../../lib/utils";
import { useTasks } from "../../contexts/TaskContext";
import { useAuth } from "../../contexts/AuthContext";
import { getTaskCompletionForDate } from "../../lib/taskService";
import TaskCard from "../../components/todo/TaskCard";
import TaskForm from "../../components/todo/TaskForm";
import type { Task } from "../../types/todo";

export default function TodayPage() {
  const { user } = useAuth();
  const { tasks, selectedDate, setSelectedDate, isLoading } = useTasks();
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "do" | "dont">("all");
  const [completionDelta, setCompletionDelta] = useState(0);
  const [repeatingCompletedCount, setRepeatingCompletedCount] = useState(0);

  const parsedDate = parseISO(selectedDate + "T12:00:00");
  const today = format(new Date(), "yyyy-MM-dd");
  const isToday = selectedDate === today;

  // Load completed count for repeating tasks for the selected date; reset delta when data changes
  useEffect(() => {
    if (!user || tasks.length === 0) {
      setRepeatingCompletedCount(0);
      setCompletionDelta(0);
      return;
    }
    let cancelled = false;
    const repeatingTasks = tasks.filter((t) => t.isRepeating);
    if (repeatingTasks.length === 0) {
      setRepeatingCompletedCount(0);
      setCompletionDelta(0);
      return;
    }
    Promise.all(
      repeatingTasks.map((task) => getTaskCompletionForDate(task, selectedDate))
    ).then((results) => {
      if (cancelled) return;
      const count = results.filter((r) => r.isCompleted).length;
      setRepeatingCompletedCount(count);
      setCompletionDelta(0);
    });
    return () => {
      cancelled = true;
    };
  }, [user, tasks, selectedDate]);

  function goToPrevDay() {
    setSelectedDate(format(subDays(parsedDate, 1), "yyyy-MM-dd"));
  }

  function goToNextDay() {
    setSelectedDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"));
  }

  const filteredTasks = tasks.filter((t) => {
    if (activeFilter === "all") return true;
    return t.category === activeFilter;
  });

  const totalCount = tasks.length;
  const oneTimeCompletedCount = tasks.filter(
    (t) => !t.isRepeating && t.status === "completed"
  ).length;
  const baseCompletedCount = oneTimeCompletedCount + repeatingCompletedCount;
  const completedCount = Math.max(0, Math.min(totalCount, baseCompletedCount + completionDelta));
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const doTasks = filteredTasks.filter((t) => t.category === "do");
  const dontTasks = filteredTasks.filter((t) => t.category === "dont");

  function handleEdit(task: Task) {
    setEditTask(task);
    setShowForm(true);
  }

  function handleCompletionChange(completed: boolean) {
    setCompletionDelta((prev) => (completed ? prev + 1 : prev - 1));
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditTask(null);
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 flex flex-col min-h-0 w-full lg:max-w-5xl xl:max-w-6xl lg:mx-auto">
      {/* Date Navigator */}
      <div className="sticky top-14 z-20 bg-background/90 backdrop-blur-sm border-b border-border/30 px-4 md:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between mb-3">
          <motion.button
            type="button"
            onClick={goToPrevDay}
            whileTap={{ scale: 0.85 }}
            className="p-2 rounded-xl text-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>

          <motion.div
            key={selectedDate}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="text-base font-bold text-foreground">
              {isToday ? "Today" : format(parsedDate, "EEE, MMM d")}
            </p>
            <p className="text-xs text-foreground/50">{format(parsedDate, "MMMM d, yyyy")}</p>
          </motion.div>

          <motion.button
            type="button"
            onClick={goToNextDay}
            whileTap={{ scale: 0.85 }}
            className="p-2 rounded-xl text-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-foreground/50">
              <span>{completedCount} / {totalCount} tasks</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-accent rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <motion.div
        className="px-4 md:px-6 lg:px-8 pt-4 pb-2 flex gap-2"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        {[
          { key: "all" as const, label: "All", icon: List },
          { key: "do" as const, label: "Do's", icon: TrendingUp },
          { key: "dont" as const, label: "Don'ts", icon: TrendingDown },
        ].map(({ key, label, icon: Icon }) => (
          <motion.button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              activeFilter === key
                ? "text-primary border border-primary/30"
                : "bg-accent/30 text-foreground/50 border border-transparent hover:bg-accent/50"
            )}
          >
            {activeFilter === key && (
              <motion.span
                layoutId="todayFilterPill"
                className="absolute inset-0 rounded-full bg-primary/15"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
            <span className="relative z-0 flex items-center gap-1.5">
              <Icon className="w-3 h-3" />
              {label}
            </span>
          </motion.button>
        ))}
      </motion.div>

      {/* Task List — one task height of space at bottom above FAB/nav */}
      <div className="flex-1 px-4 md:px-6 lg:px-8 pb-24">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-foreground/40">Loading tasks...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-foreground/20" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground/40">
                {activeFilter === "all" ? "No tasks for this day" : `No ${activeFilter === "do" ? "Do's" : "Don'ts"}`}
              </p>
              <p className="text-sm text-foreground/30 mt-1">
                Tap the + button to add a task
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="space-y-4 pt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {/* Do's section */}
            {doTasks.length > 0 && (
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
              >
                {activeFilter === "all" && (
                  <div className="flex items-center gap-2 px-1">
                    <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">
                      Do&apos;s ({doTasks.length})
                    </span>
                  </div>
                )}
                <AnimatePresence mode="popLayout">
                  {doTasks.map((task, i) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      date={selectedDate}
                      onEdit={handleEdit}
                      onCompletionChange={handleCompletionChange}
                      staggerDelay={i * 0.03}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Don'ts section */}
            {dontTasks.length > 0 && (
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.05 }}
              >
                {activeFilter === "all" && (
                  <div className="flex items-center gap-2 px-1">
                    <TrendingDown className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">
                      Don&apos;ts ({dontTasks.length})
                    </span>
                  </div>
                )}
                <AnimatePresence mode="popLayout">
                  {dontTasks.map((task, i) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      date={selectedDate}
                      onEdit={handleEdit}
                      onCompletionChange={handleCompletionChange}
                      staggerDelay={i * 0.03}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      </div>
      {/* FAB */}
      <motion.button
        type="button"
        onClick={() => { setEditTask(null); setShowForm(true); }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-20 right-4 md:right-6 lg:right-8 z-30 w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </motion.button>

      {/* Task Form */}
      <TaskForm
        isOpen={showForm}
        onClose={handleCloseForm}
        editTask={editTask}
        defaultDate={selectedDate}
      />
    </div>
  );
}
