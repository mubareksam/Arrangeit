import { useEffect, useRef, useState } from "react";
import type { UndoRecord } from "../lib/organizer/types";
import { Spinner } from "./ui";

export type TabId = "arrange" | "duplicates" | "rename" | "folders" | "log";

export const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: "arrange", label: "Arrange", glyph: "⇄" },
  { id: "duplicates", label: "Duplicates", glyph: "⧉" },
  { id: "rename", label: "Rename", glyph: "✎" },
  { id: "folders", label: "Styles", glyph: "◧" },
  { id: "log", label: "Activity", glyph: "≡" },
];

export const THEMES: { id: string; label: string; chip: string }[] = [
  { id: "dusk", label: "Dusk", chip: "linear-gradient(140deg,#5b9dff,#7c8cff)" },
  { id: "midnight", label: "Midnight", chip: "linear-gradient(140deg,#2dd4bf,#34d399)" },
  { id: "amber", label: "Amber", chip: "linear-gradient(140deg,#f0a03c,#e8743c)" },
  { id: "paper", label: "Paper", chip: "linear-gradient(140deg,#ffffff,#dbe4f0)" },
];

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
        <div className="brand-mark" aria-hidden="true">
          ⇄
        </div>
        <div className="brand-name">ArrangeIt</div>
      </div>

      <button className="path-btn" onClick={onPick} title="Choose a folder to scan">
        <span aria-hidden="true">🗀</span>
        <span className="label">{root || (demo ? "Demo folder — pick a real one" : "Choose a folder…")}</span>
      </button>

      <button className="iconbtn bordered" onClick={onScan} disabled={busy || !root} title="Rescan this folder">
        {busy ? <Spinner /> : "⟳"}
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
          >
            <span aria-hidden="true">{item.glyph}</span>
            {item.label}
            {counts[item.id] ? <span className="pill">{counts[item.id]}</span> : null}
          </button>
        ))}
      </nav>

      <span className="spacer" />

      <button className="iconbtn" onClick={onUndo} disabled={!lastUndo} title={lastUndo?.label ?? "Nothing to undo"}>
        ↺
      </button>

      <div style={{ position: "relative" }} ref={menuRef}>
        <button
          className="iconbtn bordered"
          onClick={() => setThemeOpen((open) => !open)}
          aria-expanded={themeOpen}
          title="Appearance"
        >
          ◐
        </button>
        {themeOpen ? (
          <div
            className="fade"
            style={{
              position: "absolute",
              right: 0,
              top: 36,
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: 5,
              minWidth: 132,
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
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
              >
                <span className="chip" style={{ background: item.chip }} />
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
