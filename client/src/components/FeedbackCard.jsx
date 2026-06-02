import { CheckCircle2, Gauge, Music, SlidersHorizontal } from "lucide-react";

function formatSignedCents(value) {
  if (value == null) {
    return "-";
  }
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} cents`;
}

export function FeedbackCard({ analysis, isAnalyzing }) {
  if (isAnalyzing) {
    return (
      <div className="info-card feedback-card">
        <p className="eyebrow">Analysis</p>
        <h3>Listening for pitch...</h3>
        <p className="muted">The server is extracting the stable vocal pitch contour.</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="info-card feedback-card">
        <p className="eyebrow">Analysis</p>
        <h3>No recording analyzed yet.</h3>
        <p className="muted">Record a note to see pitch accuracy and feedback.</p>
      </div>
    );
  }

  const hasFrequency = typeof analysis.average_frequency === "number";
  const showComparison = analysis.comparison_available !== false;
  const statusLabel = analysis.status ? analysis.status.replace("_", " ") : "analysis";

  return (
    <div className="info-card feedback-card">
      <p className="eyebrow">Pitch result</p>
      <div className={`status-badge ${analysis.status}`}>
        <CheckCircle2 size={17} aria-hidden="true" />
        {statusLabel}
      </div>
      <div className="metric-grid">
        <div>
          <Music size={18} aria-hidden="true" />
          <span>Frequency</span>
          <strong>{hasFrequency ? `${analysis.average_frequency.toFixed(2)} Hz` : "-"}</strong>
        </div>
        <div>
          <SlidersHorizontal size={18} aria-hidden="true" />
          <span>{showComparison ? "Cents off" : "Detected note"}</span>
          <strong>{showComparison ? formatSignedCents(analysis.cents_off) : analysis.detected_note || "-"}</strong>
        </div>
        <div>
          <Gauge size={18} aria-hidden="true" />
          <span>{showComparison ? "Accuracy" : "Comparison"}</span>
          <strong>{showComparison ? `${Math.round(analysis.accuracy)}%` : "Out of range"}</strong>
        </div>
      </div>
      <p className="feedback-text">{analysis.feedback}</p>
    </div>
  );
}
