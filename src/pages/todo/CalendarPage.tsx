import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Timer,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Circle,
  Repeat,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { useTasks } from "../../contexts/TaskContext";
import { getTasksForDate, getTaskCompletionForDate } from "../../lib/taskService";
import TaskForm from "../../components/todo/TaskForm";
import type { Task } from "../../types/todo";

interface DayInfo {
  date: string;
  taskCount: number;
  completedCount: number;
  hasRepeat: boolean;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { setSelectedDate } = useTasks();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayTasks, setDayTasks] = useState<Task[]>([]);
  const [dayInfoMap, setDayInfoMap] = useState<Map<string, DayInfo>>(new Map());
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let cur = gridStart;
  while (cur <= gridEnd) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }

  // Load month task indicators
  useEffect(() => {
    if (!user) return;
    async function loadMonthIndicators() {
      const map = new Map<string, DayInfo>();
      const batchDays = days.slice(0, 42);
      await Promise.all(
        batchDays
          .filter((d) => isSameMonth(d, currentMonth))
          .map(async (d) => {
            const dateStr = format(d, "yyyy-MM-dd");
            const tasks = await getTasksForDate(user!.id, dateStr);
            if (tasks.length > 0) {
              let completedCount = 0;
              for (const t of tasks) {
                const { isCompleted } = await getTaskCompletionForDate(t, dateStr);
                if (isCompleted) completedCount++;
              }
              map.set(dateStr, {
                date: dateStr,
                taskCount: tasks.length,
                completedCount,
                hasRepeat: tasks.some((t) => t.isRepeating),
              });
            }
          })
      );
      setDayInfoMap(map);
    }
    loadMonthIndicators();
  }, [user, currentMonth]);

  const loadDayTasks = useCallback(
    async (dateStr: string) => {
      if (!user) return;
      setLoadingDay(true);
      try {
        const tasks = await getTasksForDate(user.id, dateStr);
        setDayTasks(tasks);
      } finally {
        setLoadingDay(false);
      }
    },
    [user]
  );

  function handleDayClick(date: Date) {
    const dateStr = format(date, "yyyy-MM-dd");
    setSelectedDay(dateStr);
    setSelectedDate(dateStr);
    loadDayTasks(dateStr);
  }

  const TypeIcon = (type: Task["type"]) => {
    if (type === "time-based") return <Clock className="w-3 h-3" />;
    if (type === "duration") return <Timer className="w-3 h-3" />;
    return <CalendarDays className="w-3 h-3" />;
  };

  const timeLabel = (task: Task) => {
    if (task.type === "time-based" && task.time) return task.time;
    if (task.type === "duration" && task.startTime) return `${task.startTime}–${task.endTime}`;
    return "All day";
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 flex flex-col min-h-0 w-full lg:max-w-5xl xl:max-w-6xl lg:mx-auto">
      {/* Month Navigator */}
      <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-3 border-b border-border/30">
        <motion.button
          type="button"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          whileTap={{ scale: 0.85 }}
          className="p-2 rounded-xl text-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>

        <motion.h2
          key={format(currentMonth, "yyyy-MM")}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-base font-bold text-foreground"
        >
          {format(currentMonth, "MMMM yyyy")}
        </motion.h2>

        <motion.button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          whileTap={{ scale: 0.85 }}
          className="p-2 rounded-xl text-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 px-2 md:px-4 lg:px-6 pt-3 pb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-foreground/40 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 px-2 md:px-4 lg:px-6 gap-y-1">
        <AnimatePresence mode="wait">
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDay === dateStr;
            const isTodayDate = isToday(day);
            const info = dayInfoMap.get(dateStr);

            return (
              <motion.button
                key={dateStr}
                type="button"
                onClick={() => inMonth && handleDayClick(day)}
                whileTap={inMonth ? { scale: 0.88 } : {}}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-xl h-12 transition-all",
                  !inMonth && "opacity-20 cursor-default",
                  inMonth && "cursor-pointer hover:bg-accent/40",
                  isSelected && "bg-primary/20 ring-1 ring-primary/40",
                  isTodayDate && !isSelected && "bg-accent/30"
                )}
              >
                <span
                  className={cn(
                    "text-sm font-medium",
                    isTodayDate && "text-primary font-bold",
                    isSelected ? "text-primary" : "text-foreground",
                    !inMonth && "text-foreground/30"
                  )}
                >
                  {format(day, "d")}
                </span>

                {/* Task indicators */}
                {info && info.taskCount > 0 && inMonth && (
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from({ length: Math.min(info.taskCount, 3) }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-1 h-1 rounded-full",
                          i < info.completedCount ? "bg-green-400" : "bg-primary/50"
                        )}
                      />
                    ))}
                    {info.taskCount > 3 && (
                      <div className="w-1 h-1 rounded-full bg-foreground/20" />
                    )}
                  </div>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Selected Day Tasks */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            className="flex-1 mt-3 border-t border-border/30 px-4 md:px-6 lg:px-8 pt-4 pb-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {isToday(parseISO(selectedDay + "T12:00:00"))
                    ? "Today"
                    : format(parseISO(selectedDay + "T12:00:00"), "EEE, MMM d")}
                </h3>
                <p className="text-xs text-foreground/40 mt-0.5">
                  {dayTasks.length} task{dayTasks.length !== 1 ? "s" : ""}
                </p>
              </div>
              <motion.button
                type="button"
                onClick={() => { setEditTask(null); setShowForm(true); }}
                whileTap={{ scale: 0.88 }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </motion.button>
            </div>

            {loadingDay ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
              </div>
            ) : dayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-foreground/20" />
                </div>
                <p className="text-sm text-foreground/30">No tasks for this day</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border bg-card transition-all",
                      task.status === "completed" ? "opacity-60 border-border/40" : "border-border",
                      task.category === "dont" && "border-l-2 border-l-orange-400/50"
                    )}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {task.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-foreground/30" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium text-foreground leading-snug",
                          task.status === "completed" && "line-through text-foreground/40"
                        )}
                      >
                        {task.title}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs text-foreground/40">
                          {TypeIcon(task.type)}
                          {timeLabel(task)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium",
                            task.category === "do"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-orange-500/10 text-orange-400"
                          )}
                        >
                          {task.category === "do" ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )}
                          {task.category === "do" ? "Do" : "Don't"}
                        </span>
                        {task.isRepeating && (
                          <span className="inline-flex items-center gap-1 text-xs text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded-full">
                            <Repeat className="w-2.5 h-2.5" />
                            Repeat
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Task Form */}
      <TaskForm
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditTask(null); if (selectedDay) loadDayTasks(selectedDay); }}
        editTask={editTask}
        defaultDate={selectedDay || undefined}
      />
    </div>
  );
}
