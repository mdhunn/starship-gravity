import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InputManager } from "../sim/input";

type Layout = {
  pad: number;
  gap: number;
  bottom: number;
  top: number | null;
  side: number;
  fire: number;
  cluster: "bottom" | "sides";
};

function useTouchLayout(): Layout {
  const [layout, setLayout] = useState<Layout>({
    pad: 64,
    gap: 12,
    bottom: 24,
    top: null,
    side: 20,
    fire: 72,
    cluster: "bottom",
  });

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const short = Math.min(w, h);
      const aspect = w / h;
      const safeBottom =
        Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("env(safe-area-inset-bottom)")
            .replace("px", ""),
        ) || 0;
      const safeTop =
        Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("env(safe-area-inset-top)")
            .replace("px", ""),
        ) || 0;

      const landscapeTop = Math.round(h / 3 - 36 + safeTop * 0.25);

      if (aspect < 0.75 && short < 700) {
        const pad = Math.round(clamp(short * 0.15, 56, 76));
        setLayout({
          pad,
          gap: 10,
          bottom: 16 + safeBottom,
          top: null,
          side: 14,
          fire: Math.round(pad * 1.15),
          cluster: "bottom",
        });
        return;
      }

      if (aspect > 1.15 && h < 560) {
        const pad = Math.round(clamp(h * 0.2, 58, 80));
        setLayout({
          pad,
          gap: 10,
          bottom: 18 + safeBottom,
          top: Math.max(safeTop + 8, landscapeTop),
          side: Math.round(clamp(w * 0.04, 16, 40)),
          fire: Math.round(pad * 1.1),
          cluster: "sides",
        });
        return;
      }

      if (aspect > 1.15) {
        const pad = Math.round(clamp(short * 0.09, 68, 96));
        setLayout({
          pad,
          gap: 14,
          bottom: 28 + safeBottom,
          top: Math.max(safeTop + 12, landscapeTop),
          side: Math.round(clamp(w * 0.05, 28, 56)),
          fire: Math.round(pad * 1.12),
          cluster: "sides",
        });
        return;
      }

      if (short >= 700) {
        const pad = Math.round(clamp(short * 0.09, 68, 96));
        setLayout({
          pad,
          gap: 14,
          bottom: 28 + safeBottom,
          top: null,
          side: Math.round(clamp(w * 0.05, 28, 56)),
          fire: Math.round(pad * 1.12),
          cluster: "sides",
        });
        return;
      }

      const pad = Math.round(clamp(short * 0.13, 60, 84));
      const isLandscape = aspect > 1.1;
      setLayout({
        pad,
        gap: 12,
        bottom: 20 + safeBottom,
        top: isLandscape ? Math.max(safeTop + 8, landscapeTop) : null,
        side: 18,
        fire: Math.round(pad * 1.12),
        cluster: isLandscape ? "sides" : "bottom",
      });
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  return layout;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function IconRotateLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 8l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12h10a5 5 0 010 10H9" strokeLinecap="round" />
    </svg>
  );
}
function IconRotateRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H11a5 5 0 000 10h4" strokeLinecap="round" />
    </svg>
  );
}
function IconThrust() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5" strokeLinecap="round" />
      <path d="M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconFire() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="6" opacity="0.9" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
    </svg>
  );
}
function IconRetro() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" strokeLinecap="round" />
      <path d="M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pad({
  size,
  label,
  onDown,
  onUp,
  children,
  style,
}: {
  size: number;
  label: string;
  onDown: () => void;
  onUp: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [active, setActive] = useState(false);
  const heldRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const onUpRef = useRef(onUp);
  const onDownRef = useRef(onDown);
  onUpRef.current = onUp;
  onDownRef.current = onDown;

  const forceRelease = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    pointerIdRef.current = null;
    setActive(false);
    onUpRef.current();
  }, []);

  const down = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (heldRef.current) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pointerIdRef.current = e.pointerId;
    heldRef.current = true;
    setActive(true);
    onDownRef.current();
  }, []);

  const up = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        pointerIdRef.current !== null &&
        e.pointerId !== pointerIdRef.current
      ) {
        return;
      }
      try {
        const el = e.currentTarget as HTMLElement;
        if (el.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      forceRelease();
    },
    [forceRelease],
  );

  const blockMenu = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const block = (e: Event) => e.preventDefault();
    el.addEventListener("selectstart", block);
    return () => el.removeEventListener("selectstart", block);
  }, []);

  useEffect(() => {
    return () => {
      if (heldRef.current) {
        heldRef.current = false;
        onUpRef.current();
      }
    };
  }, []);

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={active}
      className={`touch-pad${active ? " is-active" : ""}`}
      style={{
        width: size,
        height: size,
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        ...style,
      }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={forceRelease}
      onContextMenu={blockMenu}
      onDragStart={blockMenu}
      onTouchStart={(e) => {
        e.preventDefault();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
      }}
      onTouchMove={(e) => {
        e.preventDefault();
      }}
    >
      {children}
    </div>
  );
}

export function TouchControls({
  input,
  visible,
}: {
  input: InputManager;
  visible: boolean;
}) {
  const layout = useTouchLayout();
  const layerRef = useRef<HTMLDivElement>(null);

  const clearSteer = useCallback(() => {
    input.touchSteer = 0;
  }, [input]);
  const clearThrust = useCallback(() => {
    input.touchThrust = 0;
  }, [input]);
  const clearReverse = useCallback(() => {
    input.touchReverse = 0;
  }, [input]);
  const clearFire = useCallback(() => {
    input.touchFire = false;
  }, [input]);

  useEffect(() => {
    if (!visible) {
      input.clearTouchLatches();
    }
  }, [visible, input]);

  useEffect(() => {
    return () => {
      input.clearTouchLatches();
    };
  }, [input]);

  useEffect(() => {
    const el = layerRef.current;
    if (!el || !visible) return;

    const block = (e: Event) => {
      e.preventDefault();
    };
    el.addEventListener("contextmenu", block);
    el.addEventListener("selectstart", block);
    el.addEventListener("dragstart", block);
    el.addEventListener("touchmove", block, { passive: false });
    el.addEventListener("touchstart", block, { passive: false });

    return () => {
      el.removeEventListener("contextmenu", block);
      el.removeEventListener("selectstart", block);
      el.removeEventListener("dragstart", block);
      el.removeEventListener("touchmove", block);
      el.removeEventListener("touchstart", block);
    };
  }, [visible]);

  const leftCluster = useMemo(
    () => (
      <>
        <Pad
          size={layout.pad}
          label="Rotate left"
          onDown={() => {
            input.touchSteer = 1;
          }}
          onUp={clearSteer}
        >
          <IconRotateLeft />
        </Pad>
        <Pad
          size={layout.pad}
          label="Rotate right"
          onDown={() => {
            input.touchSteer = -1;
          }}
          onUp={clearSteer}
        >
          <IconRotateRight />
        </Pad>
      </>
    ),
    [layout.pad, input, clearSteer],
  );

  // Right cluster order matches old layout: Thrust · Fire · Retro (was Hyperspace)
  const rightCluster = useMemo(
    () => (
      <>
        <Pad
          size={layout.pad}
          label="Main engines"
          onDown={() => {
            input.touchThrust = 1;
          }}
          onUp={clearThrust}
        >
          <IconThrust />
        </Pad>
        <Pad
          size={layout.fire}
          label="Fire"
          onDown={() => {
            input.touchFire = true;
          }}
          onUp={clearFire}
        >
          <IconFire />
        </Pad>
        <Pad
          size={Math.round(layout.pad * 0.85)}
          label="Retro rockets"
          onDown={() => {
            input.touchReverse = 1;
          }}
          onUp={clearReverse}
        >
          <IconRetro />
        </Pad>
      </>
    ),
    [layout.pad, layout.fire, input, clearThrust, clearReverse, clearFire],
  );

  if (!visible) return null;

  const vAnchor =
    layout.top !== null
      ? { top: layout.top, bottom: "auto" as const }
      : { bottom: layout.bottom, top: "auto" as const };

  const layerStyle: React.CSSProperties = {
    touchAction: "none",
    WebkitTouchCallout: "none",
  };

  if (layout.cluster === "sides") {
    return (
      <div
        ref={layerRef}
        className="touch-layer"
        aria-hidden={false}
        style={layerStyle}
      >
        <div
          className="touch-zone"
          style={{
            left: layout.side,
            ...vAnchor,
            gap: layout.gap,
            flexDirection: "row",
          }}
        >
          {leftCluster}
        </div>
        <div
          className="touch-zone"
          style={{
            right: layout.side,
            ...vAnchor,
            gap: layout.gap,
            flexDirection: "row",
            flexWrap: "wrap",
            maxWidth: layout.fire + layout.pad + layout.gap + 8,
            justifyContent: "flex-end",
          }}
        >
          {rightCluster}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={layerRef}
      className="touch-layer"
      aria-hidden={false}
      style={layerStyle}
    >
      <div
        className="touch-zone"
        style={{
          left: 0,
          right: 0,
          ...vAnchor,
          paddingLeft: layout.side,
          paddingRight: layout.side,
          justifyContent: "space-between",
          gap: layout.gap,
        }}
      >
        <div style={{ display: "flex", gap: layout.gap, alignItems: "center" }}>
          {leftCluster}
        </div>
        <div style={{ display: "flex", gap: layout.gap, alignItems: "center" }}>
          {rightCluster}
        </div>
      </div>
    </div>
  );
}
