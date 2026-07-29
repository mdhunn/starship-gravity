import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "starship-gravity-clock-hour12";

type HourMode = "system" | "12" | "24";

function readStoredMode(): HourMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "12" || v === "24" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemIs12Hour(): boolean {
  const resolved = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).resolvedOptions();
  if (resolved.hourCycle === "h12" || resolved.hourCycle === "h11") return true;
  if (resolved.hourCycle === "h23" || resolved.hourCycle === "h24") return false;
  if (typeof resolved.hour12 === "boolean") return resolved.hour12;
  // Fallback: format a known afternoon hour and look for AM/PM
  const sample = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).format(new Date(2026, 0, 1, 15));
  return /AM|PM/i.test(sample);
}

function createFormatter(mode: HourMode): Intl.DateTimeFormat {
  const hour12 =
    mode === "system" ? systemIs12Hour() : mode === "12";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12,
  });
}

/**
 * Fullscreen clock. Starts from system 12/24 preference; click/tap toggles.
 */
export function SystemClock({ visible }: { visible: boolean }) {
  const [mode, setMode] = useState<HourMode>(() => readStoredMode());
  const [text, setText] = useState("");

  const effectiveIs12 =
    mode === "system" ? systemIs12Hour() : mode === "12";

  const toggle = useCallback(() => {
    setMode((prev) => {
      // Resolve current display mode, then flip
      const currently12 =
        prev === "system" ? systemIs12Hour() : prev === "12";
      const next: HourMode = currently12 ? "24" : "12";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!visible) {
      setText("");
      return;
    }

    let fmt = createFormatter(mode);

    const tick = () => {
      try {
        setText(fmt.format(new Date()));
      } catch {
        setText(
          new Date().toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: effectiveIs12,
          }),
        );
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);

    const onLang = () => {
      fmt = createFormatter(mode);
      tick();
    };
    window.addEventListener("languagechange", onLang);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("languagechange", onLang);
    };
  }, [visible, mode, effectiveIs12]);

  if (!visible || !text) return null;

  return (
    <button
      type="button"
      className="system-clock"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`Current time, ${effectiveIs12 ? "12-hour" : "24-hour"} format. Tap to switch.`}
      title={`Tap to switch to ${effectiveIs12 ? "24-hour" : "12-hour"}`}
    >
      {text}
    </button>
  );
}
