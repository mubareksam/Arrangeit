import type { Insight, InsightKind } from "../../lib/organizer/types";
import { Icon, type IconName } from "../Icon";
import { Badge, Empty, Spinner, Stat } from "../ui";

const KIND_ICON: Record<InsightKind, IconName> = {
  duplicates: "duplicate",
  screenshots: "image",
  large: "sliders",
  stale: "clock",
  mixed: "layers",
  similar: "sparkles",
  unstyled: "palette",
  installers: "download",
};

const KIND_TONE: Record<InsightKind, string> = {
  duplicates: "#f59e0b",
  screenshots: "#38bdf8",
  large: "#a78bfa",
  stale: "#f2c14e",
  mixed: "#34d399",
  similar: "#5b9dff",
  unstyled: "#ec7b45",
  installers: "#ff7d8c",
};

export function InsightsTab({
  insights,
  stats,
  onRun,
  onShow,
  busy,
  planBusy,
}: {
  insights: Insight[];
  stats: { files: number; bytes: string; folders: number; reclaimable: string };
  onRun: (insight: Insight) => void;
  /** Selects the files an insight is about, without running anything. */
  onShow: (insight: Insight) => void;
  busy: boolean;
  planBusy: string | null;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">
          <Icon name="sparkles" size={14} />
          Folder intelligence
        </span>
        <span className="panel-sub">· what ArrangeIt found in this folder</span>
        <span className="spacer" />
        <Badge tone={insights.length > 0 ? "accent" : "ok"}>
          {insights.length > 0 ? `${insights.length} suggestions` : "nothing to fix"}
        </Badge>
      </div>

      <div className="statstrip">
        <Stat value={stats.files} label="FILES" />
        <Stat value={stats.bytes} label="TOTAL SIZE" />
        <Stat value={stats.folders} label="FOLDERS" />
        <Stat value={stats.reclaimable} label="RECLAIMABLE" />
      </div>

      <div className="panel-body">
        {insights.length === 0 ? (
          stats.files === 0 ? (
            <Empty
              icon="scan"
              title="Nothing scanned yet"
              hint="Pick a folder in the header — insights appear the moment the scan finishes."
            />
          ) : (
            <Empty icon="check" title="This folder is already tidy" hint="No duplicates, no stale downloads, no junk drawer. Nice." />
          )
        ) : (
          <div className="insights">
            {insights.map((insight) => (
              <article className="insight fade" key={insight.id}>
                <span className="insight-icon" style={{ color: KIND_TONE[insight.kind], background: `${KIND_TONE[insight.kind]}1f` }}>
                  <Icon name={KIND_ICON[insight.kind] ?? "sparkles"} size={15} />
                </span>
                <div className="insight-body">
                  <div className="insight-title">{insight.title}</div>
                  <div className="hint">{insight.detail}</div>
                  {insight.impact ? (
                    <span className="impact">
                      <Icon name="zap" size={10} strokeWidth={2.4} />
                      {insight.impact}
                    </span>
                  ) : null}
                  <div className="row wrap" style={{ marginTop: 3, gap: 6 }}>
                    <button className="btn sm" onClick={() => onRun(insight)} disabled={busy || planBusy === insight.id}>
                      {planBusy === insight.id ? <Spinner /> : null}
                      {insight.actionLabel}
                    </button>
                    {insight.files && insight.files.length > 0 ? (
                      <button className="btn sm ghost" onClick={() => onShow(insight)} title="Select these files in the list on the left">
                        <Icon name="search" size={11} />
                        Show {insight.count ?? insight.files.length} file{(insight.count ?? insight.files.length) === 1 ? "" : "s"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="footbar">
        <Icon name="info" size={12} style={{ color: "var(--text-3)" }} />
        <span className="hint">
          Suggestions are computed locally from names, sizes and dates — one click turns any of them into an arrange plan you
          review before anything moves.
        </span>
      </div>
    </div>
  );
}
