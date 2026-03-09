import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays, differenceInDays } from "date-fns";
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Target,
  Calendar,
  BarChart3,
  CalendarRange,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { getAnalyticsForDateRange, getEarliestTaskDate } from "../../lib/taskService";
import DatePicker from "../../components/todo/DatePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = "7d" | "30d" | "90d" | "all" | "custom";

interface RangeOption {
  id: Range;
  label: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
  { id: "all", label: "All Time" },
  { id: "custom", label: "Custom" },
];

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
  delay?: number;
}

function StatCard({ label, value, icon, color, sub, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="bg-card border border-border rounded-2xl p-4"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-foreground/50 mb-1">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-foreground/35 mt-0.5">{sub}</p>}
        </div>
        <div className={cn("p-2.5 rounded-xl shrink-0", color)}>{icon}</div>
      </div>
    </motion.div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const TOOLTIP_WRAPPER_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "none",
  boxShadow: "none",
  outline: "none",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
      className="rounded-xl px-3 py-2 text-xs shadow-lg"
    >
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
          {p.name === "Rate" ? "%" : ""}
        </p>
      ))}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth();

  const [range, setRange] = useState<Range>("7d");
  const [customFrom, setCustomFrom] = useState(
    format(subDays(new Date(), 6), "yyyy-MM-dd")
  );
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [earliestDate, setEarliestDate] = useState<string | null>(null);

  const [stats, setStats] = useState<{
    totalTasks: number;
    completedTasks: number;
    missedTasks: number;
    inProgressTasks: number;
    completionRate: number;
    dailyStats: Array<{
      date: string;
      completed: number;
      missed: number;
      inProgress: number;
      total: number;
      rate: number;
    }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  // Load earliest date once
  useEffect(() => {
    if (!user) return;
    getEarliestTaskDate(user.id).then(setEarliestDate);
  }, [user]);

  // Calculate date range and load stats
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    const today = format(new Date(), "yyyy-MM-dd");
    let startDate: string;
    let endDate: string = today;

    if (range === "7d") {
      startDate = format(subDays(new Date(), 6), "yyyy-MM-dd");
    } else if (range === "30d") {
      startDate = format(subDays(new Date(), 29), "yyyy-MM-dd");
    } else if (range === "90d") {
      startDate = format(subDays(new Date(), 89), "yyyy-MM-dd");
    } else if (range === "all") {
      startDate = earliestDate || format(subDays(new Date(), 364), "yyyy-MM-dd");
    } else {
      // custom
      startDate = customFrom;
      endDate = customTo;
    }

    setEffectiveFrom(startDate);
    setEffectiveTo(endDate);

    getAnalyticsForDateRange(user.id, startDate, endDate)
      .then(setStats)
      .finally(() => setIsLoading(false));
  }, [user, range, customFrom, customTo, earliestDate]);

  // Build X-axis date format based on range span
  const daySpan = effectiveFrom && effectiveTo
    ? differenceInDays(new Date(effectiveTo + "T12:00:00"), new Date(effectiveFrom + "T12:00:00")) + 1
    : 7;

  const xDateFmt = daySpan <= 7 ? "EEE" : daySpan <= 31 ? "MMM d" : "MMM d";

  const chartData =
    stats?.dailyStats
      .filter((d) => d.total > 0)
      .map((d) => ({
        date: format(new Date(d.date + "T12:00:00"), xDateFmt),
        Completed: d.completed,
        Missed: d.missed,
        "In progress": d.inProgress,
        Rate: d.rate,
      })) || [];

  const pieData = stats
    ? (() => {
        const arr = [
          { name: "Completed", value: stats.completedTasks, color: "#22c55e" },
          { name: "Missed", value: stats.missedTasks, color: "#ef4444" },
          { name: "In progress", value: stats.inProgressTasks, color: "#eab308" },
        ].filter((d) => d.value > 0);
        return arr.length > 0 ? arr : [{ name: "No data", value: 1, color: "var(--color-border)" }];
      })()
    : [];

  const hasTasks = stats && stats.totalTasks > 0;

  // Range label for header
  const rangeLabel =
    range === "custom"
      ? `${format(new Date(customFrom + "T12:00:00"), "MMM d")} – ${format(new Date(customTo + "T12:00:00"), "MMM d, yyyy")}`
      : range === "all"
      ? earliestDate
        ? `Since ${format(new Date(earliestDate + "T12:00:00"), "MMM d, yyyy")}`
        : "All Time"
      : RANGE_OPTIONS.find((r) => r.id === range)?.label ?? "";

  function handleRangeClick(r: Range) {
    if (r === "custom") {
      setShowCustomPicker(true);
    } else {
      setRange(r);
      setShowCustomPicker(false);
    }
  }

  function applyCustomRange() {
    if (customFrom && customTo && customFrom <= customTo) {
      setRange("custom");
      setShowCustomPicker(false);
    }
  }

  const barSize = daySpan <= 7 ? 20 : daySpan <= 31 ? 8 : 4;

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 flex flex-col min-h-0 w-full lg:max-w-5xl xl:max-w-6xl lg:mx-auto overflow-y-auto">
      {/* Range selector */}
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-3 space-y-3">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleRangeClick(r.id)}
              className={cn(
                "shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all border",
                (range === r.id || (r.id === "custom" && range === "custom"))
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-accent/20 text-foreground/50 border-transparent hover:bg-accent/40"
              )}
            >
              {r.id === "custom" ? (
                <span className="flex items-center gap-1">
                  <CalendarRange className="w-3 h-3" />
                  {range === "custom" ? "Custom ✓" : "Custom"}
                </span>
              ) : (
                r.label
              )}
            </button>
          ))}
        </div>

        {/* Active range label */}
        <motion.div
          key={rangeLabel}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5 text-foreground/40" />
          <span className="text-xs text-foreground/40 font-medium">{rangeLabel}</span>
          {range === "custom" && (
            <button
              type="button"
              onClick={() => { setRange("7d"); }}
              className="ml-1 p-0.5 rounded text-foreground/30 hover:text-foreground/60"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </motion.div>

        {/* Custom date range picker */}
        <AnimatePresence>
          {showCustomPicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-primary/70" />
                  Custom Date Range
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker
                    label="From"
                    value={customFrom}
                    onChange={setCustomFrom}
                    maxDate={customTo || format(new Date(), "yyyy-MM-dd")}
                  />
                  <DatePicker
                    label="To"
                    value={customTo}
                    onChange={setCustomTo}
                    minDate={customFrom}
                    maxDate={format(new Date(), "yyyy-MM-dd")}
                  />
                </div>

                {/* Quick range presets */}
                <div className="space-y-1.5">
                  <p className="text-xs text-foreground/40 font-medium">Quick presets</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "This week", days: 6 },
                      { label: "Last 2 weeks", days: 13 },
                      { label: "This month", days: 29 },
                      { label: "Last 3 months", days: 89 },
                      { label: "Last 6 months", days: 179 },
                      { label: "This year", days: 364 },
                    ].map(({ label, days }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setCustomFrom(format(subDays(new Date(), days), "yyyy-MM-dd"));
                          setCustomTo(format(new Date(), "yyyy-MM-dd"));
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-accent/30 text-foreground/60 hover:bg-accent/50 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomPicker(false)}
                    className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground/60 hover:bg-accent/30 transition-colors"
                  >
                    Cancel
                  </button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={applyCustomRange}
                    disabled={!customFrom || !customTo || customFrom > customTo}
                    className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    Apply Range
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 px-4 md:px-6 lg:px-8 pb-6 space-y-5 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-foreground/40">Loading analytics...</p>
          </div>
        ) : !hasTasks ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/30 flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-foreground/20" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground/40">No data for this period</p>
              <p className="text-sm text-foreground/30 mt-1">
                {range === "custom"
                  ? "No tasks found in the selected date range"
                  : "Add tasks to see your analytics"}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`${range}-${customFrom}-${customTo}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard
                label="Completion Rate"
                value={`${stats!.completionRate}%`}
                icon={<Target className="w-4 h-4 text-blue-400" />}
                color="bg-blue-500/10"
                delay={0}
              />
              <StatCard
                label="Total Tasks"
                value={stats!.totalTasks}
                icon={<Calendar className="w-4 h-4 text-purple-400" />}
                color="bg-purple-500/10"
                sub={`${daySpan} day${daySpan !== 1 ? "s" : ""}`}
                delay={0.05}
              />
              <StatCard
                label="Completed"
                value={stats!.completedTasks}
                icon={<CheckCircle2 className="w-4 h-4 text-green-400" />}
                color="bg-green-500/10"
                delay={0.1}
              />
              <StatCard
                label="Missed"
                value={stats!.missedTasks}
                icon={<XCircle className="w-4 h-4 text-red-400" />}
                color="bg-red-500/10"
                delay={0.15}
              />
              <StatCard
                label="In progress"
                value={stats!.inProgressTasks}
                icon={<TrendingUp className="w-4 h-4 text-amber-400" />}
                color="bg-amber-500/10"
                delay={0.2}
              />
            </div>

            {/* Bar chart — always show for the selected range */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary/70" />
                  <h3 className="text-sm font-bold text-foreground">Daily Progress</h3>
                </div>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs text-foreground/50">Completed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-xs text-foreground/50">Missed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs text-foreground/50">In progress</span>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData.length > 0 ? chartData : [{ date: "-", Completed: 0, Missed: 0, "In progress": 0, Rate: 0 }]} barSize={barSize} barGap={1}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--color-foreground)", fontSize: 10, opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                    interval={daySpan <= 14 ? 0 : daySpan <= 31 ? 2 : "preserveStartEnd"}
                  />
                  <YAxis hide />
                  <Tooltip
                    content={<CustomTooltip />}
                    wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                    cursor={{ fill: "var(--color-accent)", opacity: 0.4, radius: 6 }}
                  />
                  <Bar dataKey="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="Missed" fill="#ef4444" radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="In progress" fill="#eab308" radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Line chart — completion rate; always show */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-card border border-border rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-primary/70" />
                <h3 className="text-sm font-bold text-foreground">Success Rate Trend</h3>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData.length > 0 ? chartData : [{ date: "-", Rate: 0 }]}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--color-foreground)", fontSize: 10, opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                    interval={daySpan <= 14 ? 0 : "preserveStartEnd"}
                  />
                  <YAxis
                    hide
                    domain={[0, 100]}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                    cursor={{ stroke: "var(--color-primary)", strokeWidth: 1, strokeDasharray: "4 2", opacity: 0.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Rate"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={daySpan <= 14 ? { fill: "var(--color-primary)", r: 3 } : false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Pie chart + legend; always show */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4 text-primary/70" />
                  <h3 className="text-sm font-bold text-foreground">Overview</h3>
                  <span className="ml-auto text-xs text-foreground/40 bg-accent/30 px-2 py-0.5 rounded-full">
                    {rangeLabel}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-6">
                  <div className="relative shrink-0">
                    <ResponsiveContainer width={120} height={120}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={34}
                          outerRadius={54}
                          dataKey="value"
                          strokeWidth={0}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground leading-none">
                          {stats!.completionRate}%
                        </p>
                        <p className="text-[9px] text-foreground/40 mt-0.5">done</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                        <span className="text-xs text-foreground/60">Completed</span>
                      </div>
                      <span className="text-base font-bold text-foreground">
                        {stats!.completedTasks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <span className="text-xs text-foreground/60">Missed</span>
                      </div>
                      <span className="text-base font-bold text-foreground/70">
                        {stats!.missedTasks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="text-xs text-foreground/60">In progress</span>
                      </div>
                      <span className="text-base font-bold text-foreground/70">
                        {stats!.inProgressTasks}
                      </span>
                    </div>
                    <div className="h-px bg-border/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground/40">Total</span>
                      <span className="text-sm font-bold text-foreground/70">
                        {stats!.totalTasks}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>

            {/* Day breakdown table; always show for all ranges */}
            {stats!.dailyStats.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-primary/70" />
                  <h3 className="text-sm font-bold text-foreground">Day Breakdown</h3>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                  {stats!.dailyStats
                    .slice()
                    .reverse()
                    .map((day) => (
                      <div
                        key={day.date}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-accent/20 transition-colors"
                      >
                        <span className="text-xs text-foreground/50 w-20 shrink-0">
                          {format(new Date(day.date + "T12:00:00"), "EEE, MMM d")}
                        </span>
                        <div className="flex-1 h-1.5 bg-accent/40 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-primary rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${day.rate}%` }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-xs font-bold w-10 text-right shrink-0",
                            day.rate === 100
                              ? "text-green-400"
                              : day.rate >= 50
                              ? "text-primary"
                              : "text-red-400"
                          )}
                        >
                          {day.rate}%
                        </span>
                        <span className="text-xs text-foreground/35 shrink-0">
                          {day.completed}/{day.total}
                          {day.total > 0 && (
                            <span className="text-foreground/25 ml-0.5">
                              ({day.missed} missed, {day.inProgress} in progress)
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
      </div>
    </div>
  );
}
