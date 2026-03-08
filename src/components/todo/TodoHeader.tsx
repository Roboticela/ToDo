import { useTheme, type ThemeName } from "../../contexts/ThemeContext";
import { useNavigate } from "react-router-dom";
import {
  CheckSquare,
  Palette,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import SyncIndicator from "./SyncIndicator";

const themes: { name: ThemeName; label: string; colors: string }[] = [
  { name: "navy", label: "Navy", colors: "bg-blue-900" },
  { name: "dark", label: "Dark", colors: "bg-gray-900" },
  { name: "light", label: "Light", colors: "bg-gray-100" },
  { name: "sunset", label: "Sunset", colors: "bg-orange-500" },
  { name: "ocean", label: "Ocean", colors: "bg-cyan-500" },
  { name: "forest", label: "Forest", colors: "bg-green-700" },
  { name: "purple", label: "Purple Dream", colors: "bg-purple-600" },
  { name: "midnight", label: "Midnight", colors: "bg-indigo-900" },
];

interface TodoHeaderProps {
  title?: string;
  rightContent?: React.ReactNode;
}

export default function TodoHeader({ title = "Roboticela ToDo", rightContent }: TodoHeaderProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const currentTheme = themes.find((t) => t.name === theme);

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-30 w-full h-14 border-b border-border/40 bg-card/80 backdrop-blur-xl flex items-center px-4 gap-2"
    >
      <button
        type="button"
        onClick={() => navigate("/todo")}
        className="flex items-center gap-2 flex-shrink-0"
      >
        <CheckSquare className="w-6 h-6 text-primary" strokeWidth={2} />
        <h1 className="text-base font-bold text-foreground">
          <span className="sm:hidden">ToDo</span>
          <span className="hidden sm:inline">{title}</span>
        </h1>
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <SyncIndicator />

        {rightContent}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl h-9 px-3">
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">{currentTheme?.label}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 rounded-xl max-h-[60vh] overflow-y-auto">
            <AnimatePresence>
              {themes.map((t, i) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, delay: i * 0.02 }}
                >
                  <DropdownMenuItem
                    onClick={() => setTheme(t.name)}
                    className="flex items-center gap-2.5 cursor-pointer"
                  >
                    <div className={cn("w-5 h-5 rounded flex-shrink-0", t.colors)} />
                    <span className="text-sm">{t.label}</span>
                    {theme === t.name && <span className="ml-auto text-primary text-sm">✓</span>}
                  </DropdownMenuItem>
                </motion.div>
              ))}
            </AnimatePresence>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>
  );
}
