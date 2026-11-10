import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { Kbd } from "./ui";

export interface Command {
  id: string;
  label: string;
  desc?: string;
  group: string;
  icon?: IconName;
  keys?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.desc ?? ""} ${command.group}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const groups = [...new Set(filtered.map((command) => command.group))];

  const run = (command: Command) => {
    onClose();
    // let the palette close before the command touches state
    window.setTimeout(command.run, 0);
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search actions, tabs and folders…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(filtered.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter" && filtered[active]) {
                e.preventDefault();
                run(filtered[active]);
              }
            }}
            aria-label="Command search"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="palette-empty">Nothing matches “{query}”.</div>
          ) : (
            groups.map((group) => (
              <div key={group}>
                <div className="palette-group">{group}</div>
                {filtered
                  .filter((command) => command.group === group)
                  .map((command) => {
                    const index = filtered.indexOf(command);
                    return (
                      <button
                        key={command.id}
                        className="palette-item"
                        data-active={index === active}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => run(command)}
                      >
                        {command.icon ? <Icon name={command.icon} size={14} /> : <span style={{ width: 14 }} />}
                        <span>{command.label}</span>
                        {command.desc ? <span className="desc">{command.desc}</span> : null}
                        {command.keys ? <Kbd>{command.keys}</Kbd> : null}
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
