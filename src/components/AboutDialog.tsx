import { useEffect, useRef } from "react";
import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";
import { Badge } from "./ui";

export const APP_VERSION = "1.5.0";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Ctrl + K", label: "Command palette" },
  { keys: "Ctrl + O", label: "Choose a folder" },
  { keys: "F5", label: "Rescan" },
  { keys: "Ctrl + Z", label: "Undo the last change" },
  { keys: "/", label: "Search this folder" },
  { keys: "↑ ↓", label: "Move through files (auditions audio when on)" },
  { keys: "1 – 6", label: "Jump to a tab" },
];

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="about glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="about-hero">
          <span className="about-mark">
            <BrandMark size={46} />
          </span>
          <div>
            <h2 id="about-title" className="about-name">
              ArrangeIt
            </h2>
            <p className="about-tag">Organise a messy folder in one pass — offline, reversible, and fast.</p>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <Badge tone="accent">v{APP_VERSION}</Badge>
              <Badge>local only</Badge>
              <Badge>Windows · Tauri</Badge>
            </div>
          </div>
        </div>

        <p className="about-credit">
          <Icon name="star" size={13} />
          <span>
            Developed by <strong>Qmer</strong>
          </span>
        </p>

        <p className="hint" style={{ lineHeight: 1.55 }}>
          ArrangeIt never uploads your files. Scans, hashes, plans and previews all run on this machine; the only network
          traffic is the update check the installer makes. Every move, rename and recycle can be undone with Ctrl + Z.
        </p>

        <div className="about-grid">
          {SHORTCUTS.map((shortcut) => (
            <div className="about-key" key={shortcut.keys}>
              <kbd>{shortcut.keys}</kbd>
              <span className="hint">{shortcut.label}</span>
            </div>
          ))}
        </div>

        <div className="about-foot">
          <a className="btn sm ghost" href="https://github.com/mubareksam/Arrangeit" target="_blank" rel="noreferrer">
            <Icon name="external" size={12} /> GitHub
          </a>
          <span className="spacer" />
          <button className="btn primary sm" ref={closeRef} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
