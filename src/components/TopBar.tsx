import type { UndoRecord } from "../lib/organizer/types";
import { THEMES } from "./tabs/LogTab";
import { Spinner } from "./ui";

export type TabId = "arrange" | "duplicates" | "rename" | "folders" | "log";

export const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: "arrange", label: "Arrange", glyph: "⇄" },
  { id: "duplicates", label: "Duplicates", glyph: "⧉" },
  { id: "rename", label: "Rename", glyph: "✎" },
  { id: "folders", label: "Folder styles", glyph: "◧" },
  { id: "log", label: "Activity", glyph: "≡" },
];

export function TopBar({
  tab,
  setTab,
  counts,
  root,
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
  counts: Record<TabId, number>;
  root: string;
  onPick: () => void;
  onScan: () => void;
  busy: boolean;
  theme: string;
  setTheme: (theme: string) => void;
  lastUndo: UndoRecord | null;
  onUndo: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          ⇄
        </div>
        <div>
          <div className="brand-name">ArrangeIt</div>
          <div className="brand-sub">local-first file organizer</div>
        </div>
      </div>

      <button className="pathpill" onClick={onPick} title="Choose a folder to scan">
        <span aria-hidden="true">🗀</span>
        <span>{root || "No folder selected — click to pick"}</span>
      </button>

      <button className="btn tiny" onClick={onScan} disabled={busy}>
        {busy ? <Spinner /> : "⌕"} {busy ? "Scanning" : "Rescan"}
      </button>

      <span className="spacer" />

      <nav className="tabbar" role="tablist" aria-label="Workspace">
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
            {counts[item.id] ? <span className="count">{counts[item.id]}</span> : null}
          </button>
        ))}
      </nav>

      <div className="segmented" role="group" aria-label="Theme">
        {THEMES.map((item) => (
          <button
            key={item.id}
            aria-pressed={theme === item.id}
            onClick={() => setTheme(item.id)}
            title={`${item.label} theme`}
            style={{ padding: "5px 7px" }}
          >
            <span
              className="chip"
              style={{
                background: item.chip,
                width: 12,
                height: 12,
                borderRadius: 4,
                display: "block",
                boxShadow: "inset 0 0 0 1px rgb(0 0 0 / .25)",
              }}
            />
          </button>
        ))}
      </div>

      <button className="btn tiny" onClick={onUndo} disabled={!lastUndo} title={lastUndo?.label ?? "Nothing to undo"}>
        ↺ Undo
      </button>
    </header>
  );
}
