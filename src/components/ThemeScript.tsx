export function ThemeScript() {
  const codeToRun = `
    (function() {
      try {
        const theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', theme !== 'light');
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

