export function ThemeScript() {
  const codeToRun = `
    (function() {
      try {
        const theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', theme !== 'light');
        // Provisional Android safe-area flag (plugin may refine insets later).
        var ua = (navigator.userAgent || '').toLowerCase();
        if (/android/.test(ua) && (window.__TAURI_INTERNALS__ || window.__TAURI_METADATA__ || window.__TAURI__)) {
          document.documentElement.setAttribute('data-tauri-android', 'true');
        }
      } catch (e) {}
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: codeToRun }}
      suppressHydrationWarning
    />
  );
}

