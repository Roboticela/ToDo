import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SyncProvider } from "./contexts/SyncContext";
import { ThemeScript } from "./components/ThemeScript";
import DeepLinkAuthSetup from "./components/DeepLinkAuthSetup";
import { isTauri } from "./lib/tauri";

// Auth pages
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import AuthCallbackPage from "./pages/auth/AuthCallbackPage";
import DesktopSuccessPage from "./pages/auth/DesktopSuccessPage";
import VerifiedPage from "./pages/auth/VerifiedPage";
import EmailPreferencesPage from "./pages/auth/EmailPreferencesPage";

// App layout + pages
import AppLayout from "./components/todo/AppLayout";
import TodayPage from "./pages/todo/TodayPage";
import CalendarPage from "./pages/todo/CalendarPage";
import AnalyticsPage from "./pages/todo/AnalyticsPage";
import SettingsPage from "./pages/todo/SettingsPage";
import SubscriptionPage from "./pages/todo/SubscriptionPage";

if (isTauri()) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
      (e.ctrlKey && (e.key === "u" || e.key === "U")) ||
      (e.metaKey && e.altKey && (e.key === "I" || e.key === "J" || e.key === "C"))
    ) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeScript />
    <ThemeProvider>
      <AuthProvider>
        <DeepLinkAuthSetup />
        <SyncProvider>
          <BrowserRouter>
            <Routes>
              {/* Auth */}
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/auth/register" element={<RegisterPage />} />
              <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
              <Route path="/auth/desktop-success" element={<DesktopSuccessPage />} />
              <Route path="/auth/verified" element={<VerifiedPage />} />
              <Route path="/auth/email-preferences" element={<EmailPreferencesPage />} />

              {/* App */}
              <Route path="/todo" element={<AppLayout />}>
                <Route index element={<TodayPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="profile" element={<Navigate to="/todo/settings" replace />} />
                <Route path="subscription" element={<SubscriptionPage />} />
              </Route>

              {/* Redirect root to /todo, old paths to auth */}
              <Route path="/" element={<Navigate to="/todo" replace />} />
              <Route path="*" element={<Navigate to="/todo" replace />} />
            </Routes>
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
