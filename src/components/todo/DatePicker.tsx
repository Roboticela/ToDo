import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  X,
  CalendarDays,
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
import { useIsDesktop } from "../../hooks/useIsDesktop";

interface DatePickerProps {
  value: string;           // "YYYY-MM-DD"
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  error?: string;
}

export default function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Select date",
  minDate,
  maxDate,
  error,
}: DatePickerProps) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    value ? parseISO(value + "T12:00:00") : new Date()
  );

  useEffect(() => {
    if (value) {
      setCurrentMonth(parseISO(value + "T12:00:00"));
    }
  }, [value, open]);

  const displayValue = value
    ? format(parseISO(value + "T12:00:00"), "EEE, MMM d, yyyy")
    : "";

  function handleSelect(dateStr: string) {
    onChange(dateStr);
    setOpen(false);
  }

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

  function isDisabled(date: Date) {
    const dateStr = format(date, "yyyy-MM-dd");
    if (minDate && dateStr < minDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    return false;
  }

  const picker = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-0 z-61 pointer-events-none lg:flex lg:items-center lg:justify-center lg:p-4">
          <motion.div
            key="sheet"
            initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
            animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
            transition={isDesktop ? { duration: 0.2 } : { type: "spring", stiffness: 320, damping: 38 }}
            className={cn(
              "pointer-events-auto w-full max-w-2xl bg-card border border-border overflow-hidden",
              "fixed bottom-0 left-0 right-0 mx-auto z-61 rounded-t-3xl border-t lg:relative lg:rounded-xl lg:max-h-[90vh]"
            )}
          >
            {/* Handle - hide on desktop */}
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 rounded-full bg-border/70" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary/70" />
                <span className="text-sm font-bold text-foreground">
                  {label || "Select Date"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl text-foreground/40 hover:text-foreground/70 hover:bg-accent/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Month navigator */}
            <div className="flex items-center justify-between px-5 py-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-2 rounded-xl text-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.button>

              <motion.span
                key={format(currentMonth, "yyyy-MM")}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-bold text-foreground"
              >
                {format(currentMonth, "MMMM yyyy")}
              </motion.span>

              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-2 rounded-xl text-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 px-3 pb-1">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-foreground/35 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 px-3 pb-2 gap-y-0.5">
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const inMonth = isSameMonth(day, currentMonth);
                const isSelected = value === dateStr;
                const isTodayDate = isToday(day);
                const disabled = isDisabled(day);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    disabled={disabled || !inMonth}
                    onClick={() => handleSelect(dateStr)}
                    className={cn(
                      "relative flex items-center justify-center h-11 rounded-xl text-sm font-medium transition-all mx-0.5",
                      !inMonth && "opacity-0 pointer-events-none",
                      disabled && "opacity-25 cursor-not-allowed",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-md"
                        : isTodayDate
                        ? "bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/25"
                        : "text-foreground hover:bg-accent/50"
                    )}
                  >
                    {format(day, "d")}
                    {isTodayDate && !isSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Today button */}
            <div className="px-5 pb-6 pt-2">
              <button
                type="button"
                onClick={() => handleSelect(format(new Date(), "yyyy-MM-dd"))}
                className="w-full h-11 rounded-xl border border-primary/30 text-primary text-sm font-semibold bg-primary/10 hover:bg-primary/20 transition-all"
              >
                Go to Today
              </button>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium text-foreground/80">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full h-11 px-4 rounded-xl border bg-accent/20 text-left flex items-center justify-between gap-2 transition-all",
          error ? "border-red-500/50" : "border-border",
          "focus:outline-none focus:ring-2 focus:ring-primary/40"
        )}
      >
        <span className={cn("text-sm", displayValue ? "text-foreground" : "text-foreground/30")}>
          {displayValue || placeholder}
        </span>
        <CalendarDays className="w-4 h-4 text-foreground/40 shrink-0" />
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {typeof window !== "undefined" && createPortal(picker, document.body)}
    </div>
  );
}
