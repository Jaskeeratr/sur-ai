import { useMemo, useState } from "react";
import { Award, Gauge, LineChart as LineChartIcon, Trash2, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { buildTrendData, clearProgress, loadProgress, summarizeProgress } from "../data/progress.js";

const MODE_LABELS = {
  harmonium: "Harmonium",
  sargam: "Sargam",
  practice: "Practice"
};

function formatTimestamp(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function ProgressPage() {
  const [entries, setEntries] = useState(() => loadProgress());
  const [modeFilter, setModeFilter] = useState("all");

  const filtered = useMemo(
    () => (modeFilter === "all" ? entries : entries.filter((entry) => entry.mode === modeFilter)),
    [entries, modeFilter]
  );
  const summary = useMemo(() => summarizeProgress(filtered), [filtered]);
  const trend = useMemo(() => buildTrendData(filtered), [filtered]);

  function handleClear() {
    clearProgress();
    setEntries([]);
  }

  return (
    <div className="progress-layout">
      <section className="practice-main">
        <div className="practice-builder">
          <div className="practice-builder-row">
            <div>
              <p className="eyebrow">Riyaz history</p>
              <h3>Your practice progress</h3>
            </div>
            <div className="root-selector" aria-label="Filter by mode">
              {["all", "harmonium", "sargam", "practice"].map((mode) => (
                <button
                  className={modeFilter === mode ? "selected" : ""}
                  key={mode}
                  type="button"
                  onClick={() => setModeFilter(mode)}
                >
                  {mode === "all" ? "All" : MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="progress-stats">
            <div>
              <Gauge size={18} aria-hidden="true" />
              <span>Attempts</span>
              <strong>{summary.attempts}</strong>
            </div>
            <div>
              <TrendingUp size={18} aria-hidden="true" />
              <span>Average accuracy</span>
              <strong>{summary.averageAccuracy != null ? `${summary.averageAccuracy}%` : "-"}</strong>
            </div>
            <div>
              <LineChartIcon size={18} aria-hidden="true" />
              <span>Last 10 average</span>
              <strong>{summary.recentAverage != null ? `${summary.recentAverage}%` : "-"}</strong>
            </div>
            <div>
              <Award size={18} aria-hidden="true" />
              <span>Best</span>
              <strong>{summary.bestAccuracy != null ? `${summary.bestAccuracy}%` : "-"}</strong>
            </div>
          </div>

          {trend.length >= 2 ? (
            <div className="graph-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#d9e2dc" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="attempt"
                    label={{ value: "Attempt", position: "insideBottom", offset: -4 }}
                    tick={{ fill: "#53635b", fontSize: 12 }}
                  />
                  <YAxis domain={[0, 100]} width={44} tick={{ fill: "#53635b", fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "accuracy"]}
                    labelFormatter={(value, payload) => {
                      const point = payload?.[0]?.payload;
                      return point ? `${MODE_LABELS[point.mode] || point.mode}: ${point.label}` : `Attempt ${value}`;
                    }}
                  />
                  <ReferenceLine y={90} stroke="#1f6f5b" strokeDasharray="6 4" label={{ value: "goal", position: "insideTopRight", fill: "#1f6f5b", fontSize: 12 }} />
                  <Line type="monotone" dataKey="accuracy" stroke="#b54b35" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-graph">
              Record at least two scored attempts to see your accuracy trend.
            </div>
          )}
        </div>
      </section>

      <aside className="practice-side">
        <div className="info-card summary-card">
          <div className="summary-header">
            <div>
              <p className="eyebrow">Recent attempts</p>
              <h3>{filtered.length ? `${filtered.length} saved` : "No attempts yet"}</h3>
            </div>
            {entries.length ? (
              <button className="icon-button" type="button" onClick={handleClear} title="Clear saved progress">
                <Trash2 size={18} />
              </button>
            ) : null}
          </div>
          <div className="summary-list progress-list">
            {filtered.length ? (
              filtered.slice(0, 25).map((entry) => (
                <div className="summary-row" key={entry.id}>
                  <span>
                    <em className="progress-mode">{MODE_LABELS[entry.mode] || entry.mode}</em>
                    {entry.label}
                    <small>{formatTimestamp(entry.recordedAt)}</small>
                  </span>
                  <strong>{entry.accuracy != null ? `${entry.accuracy}%` : "-"}</strong>
                </div>
              ))
            ) : (
              <p className="muted">
                Attempts from the Harmonium, Sargam, and Practice pages are saved on this
                device automatically after each successful analysis.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
