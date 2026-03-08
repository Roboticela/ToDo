import { memo, useState } from "react";
import { useTheme, type ThemeName } from "../../contexts/ThemeContext";
import { useNavigate } from "react-router-dom";
import {
  CheckSquare,
  Palette,
  ChevronDown,
  Menu,
  Info,
  Github,
  FileText,
  Shield,
  Scale,
  HelpCircle,
  RefreshCw,
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
import { openLink } from "../../lib/tauri";
import SyncIndicator from "./SyncIndicator";
import { useSync } from "../../contexts/SyncContext";
import AboutModal from "../AboutModal";
import LicenseModal from "../LicenseModal";

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

function TodoHeader({ title = "Roboticela ToDo", rightContent }: TodoHeaderProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { triggerSync, isSyncing } = useSync();
  const currentTheme = themes.find((t) => t.name === theme);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);

  return (
    <>
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-30 lg:z-50 w-full h-14 border-b border-border/40 bg-card/80 backdrop-blur-xl flex items-center px-4 md:px-6 lg:px-8 gap-2 lg:-ml-56 lg:w-screen"
    >
      <button
        type="button"
        onClick={() => navigate("/todo")}
        className="flex items-center gap-2 flex-shrink-0"
      >
        <CheckSquare className="w-6 h-6 text-primary" strokeWidth={2} />
        <h1 className="text-base font-bold text-foreground">
          <span className="sm:hidden">ToDo</span>
          <span className="hidden sm:inline">Roboticela ToDo</span>
        </h1>
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <SyncIndicator />

        {rightContent}

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl h-9 px-3 inline-flex items-center justify-center"
            onClick={() => triggerSync()}
            disabled={isSyncing}
            title="Sync"
          >
            <RefreshCw className={cn("w-4 h-4 shrink-0", isSyncing && "animate-spin")} />
            <span className="hidden sm:inline text-xs leading-none">{isSyncing ? "Syncing..." : "Sync"}</span>
          </Button>
        </motion.div>

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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl h-9 px-3">
                <Menu className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Menu</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[9.6rem] rounded-xl max-h-[80vh] overflow-y-auto">
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer" onClick={() => setAboutModalOpen(true)}>
              <Info className="w-4 h-4" />
              <span>About</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer" onClick={() => openLink("https://github.com/Roboticela/ToDo", { openInNewTab: true })}>
              <Github className="w-4 h-4" />
              <span>Github</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer" onClick={() => setLicenseModalOpen(true)}>
              <FileText className="w-4 h-4" />
              <span>License</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer" onClick={() => openLink("https://roboticela.com/support", { openInNewTab: true })}>
              <HelpCircle className="w-4 h-4" />
              <span>Support</span>
            </DropdownMenuItem>
            <div className="h-px bg-border my-1" />
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer" onClick={() => openLink("https://roboticela.com/privacy", { openInNewTab: true })}>
              <Shield className="w-4 h-4" />
              <span>Privacy Policy</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-3 cursor-pointer" onClick={() => openLink("https://roboticela.com/terms", { openInNewTab: true })}>
              <Scale className="w-4 h-4" />
              <span>Terms of Service</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.header>

      <AboutModal isOpen={aboutModalOpen} onClose={() => setAboutModalOpen(false)} />
      <LicenseModal isOpen={licenseModalOpen} onClose={() => setLicenseModalOpen(false)} />
    </>
  );
}

export default memo(TodoHeader);
