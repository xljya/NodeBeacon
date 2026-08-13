(() => {
  const parseAppearance = (value) => {
    if (!value) return "system";
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  };

  try {
    const appearance = parseAppearance(localStorage.getItem("appearance"));
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const isDark = appearance === "dark" || (appearance !== "light" && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
  } catch {
    document.documentElement.classList.remove("dark");
  }
})();
