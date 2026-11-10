import { useEffect, useRef, useState } from "react";
import type { UndoRecord } from "../lib/organizer/types";
import { BrandMark } from "./BrandMark";
import { Icon, type IconName } from "./Icon";
import { Kbd, Spinner } from "./ui";

export type TabId = "arrange" | "duplicates" | "rename" | "folders" | "insights" | "log";

export const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "arrange", label: "Arrange", icon: "sort" },
  { id: "duplicates", label: "Duplicates", icon: "duplicate" },
  { id: "rename", label: "Rename", icon: "pencil" },
  { id: "folders", label: "Styles", icon: "folder" },
  { id: "insights", label: "Insights", icon: "sparkles" },
  { id: "log", label: "History", icon: "history" },
];

export const THEMES: { id: string; label: string; chip: string }[] = [
  { id: "dusk", label: "Dusk", chip: "linear-gradient(140deg,#5b9dff,#8b7bff)" },
  { id: "midnight", label: "Midnight", chip: "linear-gradient(140deg,#2dd4bf,#4ade80)" },
  { id: "amber", label: "Amber", chip: "linear-gradient(140deg,#f0a03c,#ec7b45)" },
  { id: "paper", label: "Paper", chip: "linear-gradient(140deg,#ffffff,#dbe4f0)" },
];

function Crumbs({ root, demo, onPick }: { root: string; demo: boolean; onPick: () => void }) {
  const parts = root ? root.split(/[\\/]+/).filter(Boolean) : [];
  const shown = parts.slice(-2);
  return (
    <div className="crumbs">
      {parts.length === 0 ? (
        <button className="crumb last" onClick={onPick}>
          {demo ? "Demo folder — pick a real one" : "Choose a folder…"}
        </button>
      ) : (
        <>
          {parts.length > 2 ? <span className="crumb-sep">…</span> : null}
          {shown.map((part, index) => (
            <span key={`${part}-${index}`} className="row" style={{ gap: 2, minWidth: 0 }}>
              {index > 0 ? <span className="crumb-sep">›</span> : null}
              <button className={`crumb ${index === shown.length - 1 ? "last" : ""}`} onClick={onPick} title={root}>
                {part}
              </button>
            </span>
          ))}
        </>
      )}
    </div>
  );
}

export function TopBar({
  tab,
  setTab,
  counts,
  root,
  demo,
  onPick,
  onScan,
  busy,
  theme,
  setTheme,
  lastUndo,
  onUndo,
  onPalette,
  reduceEffects,
  onReduceEffects,
}: {
  tab: TabId;
  setTab: (tab: TabId) => void;
  counts: Partial<Record<TabId, number>>;
  root: string;
  demo: boolean;
  onPick: () => void;
  onScan: () => void;
  busy: boolean;
  theme: string;
  setTheme: (theme: string) => void;
  lastUndo: UndoRecord | null;
  onUndo: () => void;
  onPalette: () => void;
  reduceEffects: boolean;
  onReduceEffects: (value: boolean) => void;
}) {
  const [themeOpen, setThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!themeOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setThemeOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [themeOpen]);

  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark size={29} />
        <div className="brand-name">ArrangeIt</div>
      </div>

      <Crumbs root={root} demo={demo} onPick={onPick} />

      <button className="iconbtn bordered" onClick={onScan} disabled={busy} title="Rescan (F5)">
        {busy ? <Spinner /> : <Icon name="refresh" size={14} />}
      </button>

      <button className="iconbtn bordered wide" onClick={onPalette} title="Command palette (Ctrl+K)">
        <Icon name="command" size={13} />
        <Kbd>K</Kbd>
      </button>

      <span className="spacer" />

      <nav className="tabs" role="tablist" aria-label="Workspace">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            className="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            title={`${item.label} (${TABS.findIndex((t) => t.id === item.id) + 1})`}
          >
            <Icon name={item.icon} size={14} />
            {item.label}
            {counts[item.id] ? <span className="pill">{counts[item.id]}</span> : null}
          </button>
        ))}
      </nav>

      <span className="spacer" />

      <button className="iconbtn" onClick={onUndo} disabled={!lastUndo} title={lastUndo?.label ?? "Nothing to undo"}>
        <Icon name="undo" size={15} />
      </button>

      <div style={{ position: "relative" }} ref={menuRef}>
        <button
          className="iconbtn bordered"
          onClick={() => setThemeOpen((open) => !open)}
          aria-expanded={themeOpen}
          title="Appearance"
        >
          <Icon name="palette" size={14} />
        </button>
        {themeOpen ? (
          <div
            className="glass fade"
            style={{
              position: "absolute",
              right: 0,
              top: 38,
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: 6,
              minWidth: 148,
              borderRadius: 14,
              boxShadow: "var(--shadow-lg), inset 0 1px 0 var(--glass-hi)",
            }}
          >
            {THEMES.map((item) => (
              <button
                key={item.id}
                className="themebtn"
                data-active={theme === item.id}
                onClick={() => {
                  setTheme(item.id);
                  setThemeOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid transparent",
                  background: theme === item.id ? "var(--accent-soft)" : "transparent",
                  color: theme === item.id ? "var(--text)" : "var(--text-2)",
                  fontSize: 12,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: item.chip,
                    boxShadow: "inset 0 0 0 1px rgb(0 0 0 / .25)",
                  }}
                />
                {item.label}
                {theme === item.id ? <Icon name="check" size={12} style={{ marginLeft: "auto" }} /> : null}
              </button>
            ))}
            <div style={{ height: 1, background: "var(--border-soft)", margin: "4px 2px" }} />
            <button
              className="themebtn"
              onClick={() => onReduceEffects(!reduceEffects)}
              title="Turns off the aurora animation and backdrop blur for slower machines"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid transparent",
                background: "transparent",
                color: "var(--text-2)",
                fontSize: 12,
                textAlign: "left",
              }}
            >
              <Icon name="zap" size={12} />
              Fast mode
              {reduceEffects ? <Icon name="check" size={12} style={{ marginLeft: "auto", color: "var(--accent)" }} /> : null}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
