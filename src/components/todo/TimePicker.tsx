import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { useIsDesktop } from "../../hooks/useIsDesktop";

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_H = 52;    // px per row
const VISIBLE = 3;    // rows visible in drum window (1 above + selected + 1 below)

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

// ─── Drum Column ──────────────────────────────────────────────────────────────

interface DrumColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
}

function DrumColumn({ items, selectedIndex, onSelect, ariaLabel }: DrumColumnProps) {
  const scrollRef    = useRef<HTMLDivElement>(null);
  const isUserDriving = useRef(false);   // true while user is touching/dragging
  const snapTimer    = useRef<ReturnType<typeof setTimeout>>();
  const didMount     = useRef(false);

  // ── scroll helper ──────────────────────────────────────────────────────────
  const scrollTo = useCallback((index: number, animated: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = index * ITEM_H;
    if (animated) {
      el.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollTop = top;
    }
  }, []);

  // ── initial position (no animation, runs once) ─────────────────────────────
  useEffect(() => {
    scrollTo(selectedIndex, false);
    didMount.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // intentionally empty dep – we only want this on mount

  // ── external changes (preset buttons, value prop) ──────────────────────────
  // Only scrolls when the change came from OUTSIDE (not from the user dragging)
  useEffect(() => {
    if (!didMount.current) return;
    if (!isUserDriving.current) {
      scrollTo(selectedIndex, true);
    }
  }, [selectedIndex, scrollTo]);

  // ── snap after user stops scrolling ───────────────────────────────────────
  const scheduleSnap = useCallback(() => {
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      isUserDriving.current = false;
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
      
      scrollTo(idx, true);
      onSelect(idx);
    }, 120);
  }, [items.length, onSelect, scrollTo]);

  // ── scroll handler ─────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    if (!isUserDriving.current) return; // ignore programmatic scrolls
    scheduleSnap();
  }, [scheduleSnap]);

  // ── pointer / touch start → user is in control ────────────────────────────
  const handlePointerDown = useCallback(() => {
    isUserDriving.current = true;
    clearTimeout(snapTimer.current);
  }, []);

  // ── wheel (desktop) ────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    isUserDriving.current = true;
    clearTimeout(snapTimer.current);
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += e.deltaY;
    scheduleSnap();
  }, [scheduleSnap]);

  // ── cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => clearTimeout(snapTimer.current), []);

  // ── step by arrow buttons ──────────────────────────────────────────────────
  const step = useCallback((dir: -1 | 1) => {
    isUserDriving.current = false;
    clearTimeout(snapTimer.current);
    const newIdx = Math.max(0, Math.min(items.length - 1, selectedIndex + dir));
    onSelect(newIdx);
    scrollTo(newIdx, true);
  }, [items.length, selectedIndex, onSelect, scrollTo]);

  const canUp   = selectedIndex > 0;
  const canDown = selectedIndex < items.length - 1;

  return (
    <div className="flex-1 flex flex-col items-center gap-1 select-none" aria-label={ariaLabel}>

      {/* Up arrow */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.82 }}
        onClick={() => step(-1)}
        disabled={!canUp}
        className={cn(
          "w-full flex items-center justify-center h-9 rounded-xl transition-all",
          canUp
            ? "text-primary/70 hover:text-primary hover:bg-primary/10 active:bg-primary/20"
            : "text-foreground/15 cursor-default"
        )}
      >
        <ChevronUp className="w-5 h-5" strokeWidth={2.5} />
      </motion.button>

      {/* Drum scroll */}
      <div className="relative w-full" style={{ height: ITEM_H * VISIBLE }}>
        {/* Top fade */}
        <div
          className="absolute top-0 inset-x-0 z-10 pointer-events-none"
          style={{
            height: ITEM_H,
            background: "linear-gradient(to bottom, var(--color-card) 30%, transparent)",
          }}
        />

        {/* Selection band */}
        <div
          className="absolute inset-x-1 rounded-xl bg-primary/10 border border-primary/20 z-10 pointer-events-none"
          style={{ top: ITEM_H, height: ITEM_H }}
        />

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 inset-x-0 z-10 pointer-events-none"
          style={{
            height: ITEM_H,
            background: "linear-gradient(to top, var(--color-card) 30%, transparent)",
          }}
        />

        {/* Scroll area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          onWheel={handleWheel}
          className="overflow-y-scroll hide-scrollbar touch-pan-y"
          style={{
            height: ITEM_H * VISIBLE,
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Top spacer */}
          <div style={{ height: ITEM_H, scrollSnapAlign: "none" }} />

          {items.map((item, i) => (
            <div
              key={item}
              onClick={() => { isUserDriving.current = false; onSelect(i); scrollTo(i, true); }}
              className="flex items-center justify-center cursor-pointer"
              style={{ height: ITEM_H, scrollSnapAlign: "center" }}
            >
              <span
                className={cn(
                  "font-semibold transition-all duration-100 tabular-nums",
                  i === selectedIndex
                    ? "text-primary text-2xl"
                    : Math.abs(i - selectedIndex) === 1
                    ? "text-foreground/45 text-xl"
                    : "text-foreground/15 text-lg"
                )}
              >
                {item}
              </span>
            </div>
          ))}

          {/* Bottom spacer */}
          <div style={{ height: ITEM_H, scrollSnapAlign: "none" }} />
        </div>
      </div>

      {/* Down arrow */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.82 }}
        onClick={() => step(1)}
        disabled={!canDown}
        className={cn(
          "w-full flex items-center justify-center h-9 rounded-xl transition-all",
          canDown
            ? "text-primary/70 hover:text-primary hover:bg-primary/10 active:bg-primary/20"
            : "text-foreground/15 cursor-default"
        )}
      >
        <ChevronDown className="w-5 h-5" strokeWidth={2.5} />
      </motion.button>

    </div>
  );
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function parseValue(v: string) {
  if (!v) return { hour24: 0, minute: 0, ampm: "AM" as "AM" | "PM", hour12: 12 };
  const [h, m] = v.split(":").map(Number);
  const hour24 = h || 0;
  const minute = m || 0;
  const ampm: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  return { hour24, minute, ampm, hour12 };
}

function build24hTime(hourIdx: number, minuteIdx: number, ampm: "AM" | "PM", is24h: boolean): string {
  let h: number;
  if (is24h) {
    h = hourIdx;
  } else {
    const raw = hourIdx + 1; // 1-12
    if (ampm === "AM") {
      h = raw === 12 ? 0 : raw;
    } else {
      h = raw === 12 ? 12 : raw + 12;
    }
  }
  return `${String(h).padStart(2, "0")}:${String(minuteIdx).padStart(2, "0")}`;
}

// ─── TimePicker ───────────────────────────────────────────────────────────────

interface TimePickerProps {
  value: string;          // "HH:MM" 24-hour
  onChange: (time: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  use24h?: boolean;
}

export default function TimePicker({
  value,
  onChange,
  label,
  placeholder = "Select time",
  error,
  use24h = false,
}: TimePickerProps) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);

  // Internal drum state — always in sync with `value` on open
  const [hourIdx,   setHourIdx]   = useState<number>(0);
  const [minuteIdx, setMinuteIdx] = useState<number>(0);
  const [ampm,      setAmpm]      = useState<"AM" | "PM">("AM");

  // Sync drum state when picker opens
  useEffect(() => {
    if (!open) return;
    const p = parseValue(value);
    setHourIdx(use24h ? p.hour24 : p.hour12 - 1);
    setMinuteIdx(p.minute);
    setAmpm(p.ampm);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: we intentionally do NOT include value/use24h – we only want
  // to sync once per open event, not on every value change mid-session.

  const hours = use24h ? HOURS_24 : HOURS_12;

  // Live preview string
  const previewStr = build24hTime(hourIdx, minuteIdx, ampm, use24h);
  const previewDisplay = (() => {
    const [h, m] = previewStr.split(":").map(Number);
    if (use24h) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  })();

  // Trigger button display
  const displayValue = (() => {
    if (!value) return "";
    const p = parseValue(value);
    if (use24h) return `${String(p.hour24).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    return `${p.hour12}:${String(p.minute).padStart(2, "0")} ${p.ampm}`;
  })();

  function handleConfirm() {
    onChange(build24hTime(hourIdx, minuteIdx, ampm, use24h));
    setOpen(false);
  }

  function applyPreset(h24: number, m: number) {
    const ap: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    setAmpm(ap);
    setMinuteIdx(m);
    setHourIdx(use24h ? h24 : h12 - 1);
  }

  const PRESETS: { label: string; h: number; m: number }[] = [
    { label: "6:00 AM",  h: 6,  m: 0  },
    { label: "8:00 AM",  h: 8,  m: 0  },
    { label: "9:00 AM",  h: 9,  m: 0  },
    { label: "12:00 PM", h: 12, m: 0  },
    { label: "2:00 PM",  h: 14, m: 0  },
    { label: "5:00 PM",  h: 17, m: 0  },
    { label: "6:00 PM",  h: 18, m: 0  },
    { label: "8:00 PM",  h: 20, m: 0  },
    { label: "10:00 PM", h: 22, m: 0  },
  ];

  const picker = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-0 z-61 pointer-events-none lg:flex lg:items-center lg:justify-center lg:p-4">
          <motion.div
            key="sheet"
            initial={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
            animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
            transition={isDesktop ? { duration: 0.2 } : { type: "spring", stiffness: 330, damping: 38 }}
            className={cn(
              "pointer-events-auto w-full max-w-2xl bg-card border border-border overflow-hidden",
              "fixed bottom-0 left-0 right-0 mx-auto z-61 rounded-t-3xl border-t lg:relative lg:rounded-xl lg:max-h-[90vh]"
            )}
          >
            {/* Handle - hide on desktop */}
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 rounded-full bg-border/60" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary/70" />
                <span className="text-sm font-bold text-foreground">{label || "Select Time"}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl text-foreground/40 hover:text-foreground/70 hover:bg-accent/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live preview */}
            <div className="text-center py-3 border-b border-border/20">
              <motion.span
                key={previewDisplay}
                initial={{ scale: 0.94, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-3xl font-bold text-foreground tabular-nums"
              >
                {previewDisplay}
              </motion.span>
            </div>

            {/* Drum wheels */}
            <div className="flex items-center px-4 gap-1">
              <DrumColumn
                items={hours}
                selectedIndex={hourIdx}
                onSelect={setHourIdx}
                ariaLabel="Hours"
              />

              {/* Colon – vertically offset by one arrow-button height so it sits in the drum centre */}
              <div className="flex flex-col gap-2.5 shrink-0 px-1" style={{ marginBottom: 0, marginTop: "calc(36px - 4px)" }}>
                <div className="w-1.5 h-1.5 rounded-full bg-foreground/35" />
                <div className="w-1.5 h-1.5 rounded-full bg-foreground/35" />
              </div>

              <DrumColumn
                items={MINUTES}
                selectedIndex={minuteIdx}
                onSelect={setMinuteIdx}
                ariaLabel="Minutes"
              />

              {/* AM/PM */}
              {!use24h && (
                <div className="flex flex-col gap-2 shrink-0 ml-3" style={{ marginTop: "36px" }}>
                  {(["AM", "PM"] as const).map((ap) => (
                    <motion.button
                      key={ap}
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setAmpm(ap)}
                      className={cn(
                        "w-14 h-12 rounded-xl text-sm font-bold transition-all",
                        ampm === ap
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-accent/40 text-foreground/45 hover:bg-accent"
                      )}
                    >
                      {ap}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick presets */}
            <div className="px-5 pt-2 pb-1">
              <p className="text-xs font-medium text-foreground/35 mb-2">Quick select</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(({ label: pl, h, m }) => {
                  const cur24 = build24hTime(hourIdx, minuteIdx, ampm, use24h);
                  const presetTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                  return (
                    <button
                      key={pl}
                      type="button"
                      onClick={() => applyPreset(h, m)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                        cur24 === presetTime
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-accent/25 text-foreground/55 border-transparent hover:bg-accent/50"
                      )}
                    >
                      {pl}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Confirm */}
            <div className="px-5 pb-6 pt-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleConfirm}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
              >
                Set {previewDisplay}
              </motion.button>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium text-foreground/80">{label}</label>}
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
        <Clock className="w-4 h-4 text-foreground/40 shrink-0" />
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {typeof window !== "undefined" && createPortal(picker, document.body)}
    </div>
  );
}
