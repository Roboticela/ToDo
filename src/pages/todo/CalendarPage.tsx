import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  List,
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
import TaskCard from "../../components/todo/TaskCard";
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
  const [activeFilter, setActiveFilter] = useState<"all" | "do" | "dont">("all");
  const [completedCount, setCompletedCount] = useState(0);

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
        let done = 0;
        for (const t of tasks) {
          const { isCompleted } = await getTaskCompletionForDate(t, dateStr);
          if (isCompleted) done++;
        }
        setCompletedCount(done);
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

  function handleEdit(task: Task) {
    setEditTask(task);
    setShowForm(true);
  }

  function handleCompletionChange(completed: boolean) {
    setCompletedCount((prev) => (completed ? prev + 1 : Math.max(0, prev - 1)));
  }

  const filteredTasks = selectedDay
    ? dayTasks.filter((t) => {
        if (activeFilter === "all") return true;
        return t.category === activeFilter;
      })
    : [];
  const totalCount = dayTasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const doTasks = filteredTasks.filter((t) => t.category === "do");
  const dontTasks = filteredTasks.filter((t) => t.category === "dont");

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

      {/* Tasks panel - always visible */}
      <motion.div
        initial={false}
        className="flex-1 mt-3 border-t border-border/30 px-4 md:px-6 lg:px-8 pt-4 pb-4 min-h-[200px] flex flex-col"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {selectedDay
                ? isToday(parseISO(selectedDay + "T12:00:00"))
                  ? "Today"
                  : format(parseISO(selectedDay + "T12:00:00"), "EEE, MMM d")
                : "Tasks"}
            </h3>
            <p className="text-xs text-foreground/40 mt-0.5">
              {selectedDay
                ? `${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""}`
                : "Select a day from the calendar"}
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

        {!selectedDay ? (
          <div className="flex flex-col items-center justify-center flex-1 py-10 gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <CalendarDays className="w-6 h-6 text-foreground/20" />
            </div>
            <p className="text-sm text-foreground/30">Select a day from the calendar above to view tasks</p>
          </div>
        ) : loadingDay ? (
          <div className="flex flex-col items-center justify-center flex-1 py-12 gap-3">
            <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-foreground/40">Loading tasks...</p>
          </div>
        ) : dayTasks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center flex-1 py-16 gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-foreground/20" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground/40">No tasks for this day</p>
              <p className="text-sm text-foreground/30 mt-1">Tap Add Task to create one</p>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Progress bar - same as Today */}
            {totalCount > 0 && (
              <div className="space-y-1.5 mb-3">
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

            {/* Filter tabs - same as Today */}
            <div className="flex gap-2 pb-2">
              {[
                { key: "all" as const, label: "All", icon: List },
                { key: "do" as const, label: "Do's", icon: TrendingUp },
                { key: "dont" as const, label: "Don'ts", icon: TrendingDown },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveFilter(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    activeFilter === key
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-accent/30 text-foreground/50 border border-transparent hover:bg-accent/50"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Task list with TaskCard - same as Today */}
            <div className="space-y-4 pt-1 flex-1 min-h-0">
              {doTasks.length > 0 && (
                <div className="space-y-2">
                  {activeFilter === "all" && (
                    <div className="flex items-center gap-2 px-1">
                      <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">
                        Do&apos;s ({doTasks.length})
                      </span>
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {doTasks.map((task) => (
                      <TaskCard key={task.id} task={task} date={selectedDay!} onEdit={handleEdit} onCompletionChange={handleCompletionChange} />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {dontTasks.length > 0 && (
                <div className="space-y-2">
                  {activeFilter === "all" && (
                    <div className="flex items-center gap-2 px-1">
                      <TrendingDown className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">
                        Don&apos;ts ({dontTasks.length})
                      </span>
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {dontTasks.map((task) => (
                      <TaskCard key={task.id} task={task} date={selectedDay!} onEdit={handleEdit} onCompletionChange={handleCompletionChange} />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {filteredTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <p className="text-sm text-foreground/40">
                    {activeFilter === "all" ? "No tasks for this day" : `No ${activeFilter === "do" ? "Do's" : "Don'ts"}`}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
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
