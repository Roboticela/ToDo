// @refresh reset
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { Task, TaskFormData } from "../types/todo";
import {
  createTask as svcCreate,
  updateTask as svcUpdate,
  deleteTask as svcDelete,
  completeTask as svcComplete,
  uncompleteTask as svcUncomplete,
  skipTaskForDate as svcSkipTaskForDate,
  setTaskEndDate as svcSetTaskEndDate,
  endRepeatingSeriesFromDate as svcEndSeries,
  getTasksForDate,
  getTodayString,
} from "../lib/taskService";
import { assertCanCreateTask, assertCanEnableRepeating, assertCanMoveTaskToDate, assertCanExpandRepeatDays, clampDateToHistory } from "../lib/planLimits";
import { mergeTasksPreserveRefs } from "../lib/taskEquality";
import { useAuth } from "./AuthContext";
import { useSyncActions } from "./SyncContext";

interface TaskContextType {
  tasks: Task[];
  selectedDate: string;
  isLoading: boolean;
  historyClamped: boolean;
  setSelectedDate: (date: string) => void;
  refreshTasks: (options?: { silent?: boolean }) => Promise<void>;
  createTask: (data: TaskFormData) => Promise<Task>;
  updateTask: (task: Task, data: Partial<TaskFormData>) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  skipTaskForDate: (task: Task, date: string) => Promise<void>;
  setTaskEndDate: (task: Task, endDate: string) => Promise<Task>;
  endRepeatingSeriesFromDate: (task: Task, fromDate: string) => Promise<Task>;
  // BUG-01: Accept explicit date so callers (e.g. Calendar) aren't forced to use selectedDate
  completeTask: (task: Task, date: string) => Promise<void>;
  uncompleteTask: (task: Task, date: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export function TaskProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { scheduleSync } = useSyncActions();
  const userId = user?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDateState] = useState(getTodayString());
  const [historyClamped, setHistoryClamped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // First paint / date change show a spinner; sync must never flip isLoading.
  const hasLoadedRef = useRef(false);

  const refreshTasks = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
      setTasks([]);
      hasLoadedRef.current = false;
      return;
    }
    const silent = options?.silent === true || hasLoadedRef.current;
    if (!silent) setIsLoading(true);
    try {
      const fetched = await getTasksForDate(userId, selectedDate);
      setTasks((prev) => mergeTasksPreserveRefs(prev, fetched));
      hasLoadedRef.current = true;
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [userId, selectedDate]);

  // Date / user change — first load for that selection may show spinner; later calls stay silent.
  useEffect(() => {
    hasLoadedRef.current = false;
    void refreshTasks();
  }, [userId, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: reload only on identity/date

  useEffect(() => {
    const handler = () => {
      void refreshTasks({ silent: true });
    };
    window.addEventListener("tasks-synced", handler);
    return () => window.removeEventListener("tasks-synced", handler);
  }, [refreshTasks]);

  const setSelectedDate = useCallback(
    (date: string) => {
      const { date: next, clamped } = clampDateToHistory(date, user?.plan, user?.planExpiresAt);
      setHistoryClamped(clamped);
      setSelectedDateState(next);
    },
    [user?.plan, user?.planExpiresAt]
  );

  const createTask = useCallback(
    async (data: TaskFormData): Promise<Task> => {
      if (!user) throw new Error("Not authenticated");
      await assertCanCreateTask(user.id, user.plan, data, user.planExpiresAt);
      const task = await svcCreate(user.id, data);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      return task;
    },
    [user, refreshTasks, scheduleSync]
  );

  const updateTask = useCallback(
    async (task: Task, data: Partial<TaskFormData>): Promise<Task> => {
      if (!user) throw new Error("Not authenticated");
      const willRepeat =
        data.isRepeating !== undefined
          ? Boolean(data.isRepeating && (data.repeatDays ?? task.repeatDays).length > 0)
          : task.isRepeating;
      await assertCanEnableRepeating(user.id, user.plan, task.isRepeating, willRepeat, user.planExpiresAt);
      if (data.date && data.date !== task.date) {
        await assertCanMoveTaskToDate(
          user.id,
          user.plan,
          task.id,
          task.date,
          data.date,
          willRepeat,
          user.planExpiresAt
        );
      }
      if (willRepeat) {
        const nextDays = data.repeatDays ?? task.repeatDays ?? [];
        const nextDate = data.date ?? task.date;
        const nextEnd =
          data.endDate !== undefined ? data.endDate : task.endDate;
        await assertCanExpandRepeatDays(
          user.id,
          user.plan,
          task.id,
          nextDate,
          nextEnd,
          nextDays,
          task.isRepeating,
          task.repeatDays ?? [],
          user.planExpiresAt,
          task.date,
          task.endDate ?? null
        );
      }
      const updated = await svcUpdate(task, data);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      return updated;
    },
    [user, refreshTasks, scheduleSync]
  );

  const deleteTask = useCallback(
    async (taskId: string): Promise<void> => {
      await svcDelete(taskId);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
    },
    [refreshTasks, scheduleSync]
  );

  const skipTaskForDate = useCallback(
    async (task: Task, date: string): Promise<void> => {
      await svcSkipTaskForDate(task, date);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
    },
    [refreshTasks, scheduleSync]
  );

  const setTaskEndDate = useCallback(
    async (task: Task, endDate: string): Promise<Task> => {
      const updated = await svcSetTaskEndDate(task, endDate);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      return updated;
    },
    [refreshTasks, scheduleSync]
  );

  const endRepeatingSeriesFromDate = useCallback(
    async (task: Task, fromDate: string): Promise<Task> => {
      const updated = await svcEndSeries(task, fromDate);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      return updated;
    },
    [refreshTasks, scheduleSync]
  );

  // BUG-01: Accept explicit date param — do not fall back to context selectedDate
  // which may differ when TaskCard is shown in Calendar view for a non-selected day.
  const completeTask = useCallback(
    async (task: Task, date: string): Promise<void> => {
      await svcComplete(task, date);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
    },
    [refreshTasks, scheduleSync]
  );

  const uncompleteTask = useCallback(
    async (task: Task, date: string): Promise<void> => {
      await svcUncomplete(task, date);
      await refreshTasks({ silent: true });
      scheduleSync();
      window.dispatchEvent(new CustomEvent("tasks-changed"));
    },
    [refreshTasks, scheduleSync]
  );

  const value = useMemo(
    () => ({
      tasks,
      selectedDate,
      isLoading,
      historyClamped,
      setSelectedDate,
      refreshTasks,
      createTask,
      updateTask,
      deleteTask,
      skipTaskForDate,
      setTaskEndDate,
      endRepeatingSeriesFromDate,
      completeTask,
      uncompleteTask,
    }),
    [
      tasks,
      selectedDate,
      isLoading,
      historyClamped,
      setSelectedDate,
      refreshTasks,
      createTask,
      updateTask,
      deleteTask,
      skipTaskForDate,
      setTaskEndDate,
      endRepeatingSeriesFromDate,
      completeTask,
      uncompleteTask,
    ]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) throw new Error("useTasks must be used within TaskProvider");
  return context;
}
