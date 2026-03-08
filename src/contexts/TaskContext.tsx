import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import type { Task, TaskFormData } from "../types/todo";
import {
  createTask as svcCreate,
  updateTask as svcUpdate,
  deleteTask as svcDelete,
  completeTask as svcComplete,
  uncompleteTask as svcUncomplete,
  getTasksForDate,
  getTodayString,
} from "../lib/taskService";
import { useAuth } from "./AuthContext";

interface TaskContextType {
  tasks: Task[];
  selectedDate: string;
  isLoading: boolean;
  setSelectedDate: (date: string) => void;
  refreshTasks: (options?: { silent?: boolean }) => Promise<void>;
  createTask: (data: TaskFormData) => Promise<Task>;
  updateTask: (task: Task, data: Partial<TaskFormData>) => Promise<Task>;
  deleteTask: (taskId: string) => Promise<void>;
  completeTask: (task: Task) => Promise<void>;
  uncompleteTask: (task: Task) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export function TaskProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDateState] = useState(getTodayString());
  const [isLoading, setIsLoading] = useState(false);

  const refreshTasks = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) {
      setTasks([]);
      return;
    }
    const silent = options?.silent === true;
    if (!silent) setIsLoading(true);
    try {
      const fetched = await getTasksForDate(user.id, selectedDate);
      setTasks(fetched);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(date);
  }, []);

  const createTask = useCallback(
    async (data: TaskFormData): Promise<Task> => {
      if (!user) throw new Error("Not authenticated");
      const task = await svcCreate(user.id, data);
      await refreshTasks();
      return task;
    },
    [user, refreshTasks]
  );

  const updateTask = useCallback(
    async (task: Task, data: Partial<TaskFormData>): Promise<Task> => {
      const updated = await svcUpdate(task, data);
      await refreshTasks();
      return updated;
    },
    [refreshTasks]
  );

  const deleteTask = useCallback(
    async (taskId: string): Promise<void> => {
      await svcDelete(taskId);
      await refreshTasks();
    },
    [refreshTasks]
  );

  const completeTask = useCallback(
    async (task: Task): Promise<void> => {
      await svcComplete(task, selectedDate);
      await refreshTasks({ silent: true });
    },
    [selectedDate, refreshTasks]
  );

  const uncompleteTask = useCallback(
    async (task: Task): Promise<void> => {
      await svcUncomplete(task, selectedDate);
      await refreshTasks({ silent: true });
    },
    [selectedDate, refreshTasks]
  );

  return (
    <TaskContext.Provider
      value={{
        tasks,
        selectedDate,
        isLoading,
        setSelectedDate,
        refreshTasks,
        createTask,
        updateTask,
        deleteTask,
        completeTask,
        uncompleteTask,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TaskContext);
  if (!context) throw new Error("useTasks must be used within TaskProvider");
  return context;
}
