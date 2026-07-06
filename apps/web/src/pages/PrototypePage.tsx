import { useCallback, useEffect, type SyntheticEvent } from "react";

const prototypeUrl = "/prototype/Status%20Page.dc.html?v=20260704-api-states-1";

/** Public status page. Renders the high-fidelity prototype in a full-screen iframe. */
export function PrototypePage() {
  // Only this route locks page scroll (the iframe manages its own scrolling).
  useEffect(() => {
    document.body.classList.add("prototype-active");
    return () => document.body.classList.remove("prototype-active");
  }, []);

  const handlePrototypeLoad = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
    const frame = event.currentTarget;
    let attempts = 0;
    const doc = frame.contentDocument;

    if (doc) {
      doc.addEventListener("click", (clickEvent) => {
        const target = clickEvent.target as { closest?: (selector: string) => Element | null } | null;
        const loginButton = target?.closest?.('button[title="Login"]');
        if (!loginButton) return;

        clickEvent.preventDefault();
        window.location.assign("/login");
      });
    }

    const switchToLightTheme = () => {
      attempts += 1;
      if (!doc) return;

      const section = doc.querySelector<HTMLElement>("#turn3");
      const themeButton = doc.querySelector<HTMLButtonElement>('button[title="主题"]');
      if (!section || !themeButton) {
        if (attempts < 40) window.setTimeout(switchToLightTheme, 100);
        return;
      }

      const background = doc.defaultView?.getComputedStyle(section).backgroundColor;
      if (background === "rgb(11, 14, 20)") {
        themeButton.click();
      }
    };

    switchToLightTheme();
  }, []);

  return (
    <iframe
      className="prototype-frame"
      title="NodeBeacon status page prototype"
      src={prototypeUrl}
      onLoad={handlePrototypeLoad}
    />
  );
}
