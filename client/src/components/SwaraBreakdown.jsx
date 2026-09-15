import { Target } from "lucide-react";
import { describeVerdict, findWeakestSwara } from "../data/swaraStats.js";

const BAR_RANGE_CENTS = 40;

export function SwaraBreakdown({ rows }) {
  const judged = rows.filter((row) => row.verdict !== "insufficient");
  const weakest = findWeakestSwara(rows);

  return (
    <div className="info-card swara-card">
      <div className="section-heading">
        <p className="eyebrow">Per-swara tendency</p>
        <h3>Where your pitch drifts</h3>
      </div>

      {rows.length ? (
        <>
          <p className="muted swara-headline">
            {weakest ? (
              <>
                <Target size={16} aria-hidden="true" />
                Focus on <strong>{weakest.swara}</strong> - it {describeVerdict(weakest)}.
              </>
            ) : judged.length ? (
              <>
                <Target size={16} aria-hidden="true" />
                No consistent bias yet - every judged swara is landing in tune.
              </>
            ) : (
              "Record a few more attempts per swara to see your tendencies."
            )}
          </p>

          <ul className="swara-list">
            {rows.map((row) => {
              const clamped = Math.max(-BAR_RANGE_CENTS, Math.min(BAR_RANGE_CENTS, row.meanCents));
              const width = (Math.abs(clamped) / BAR_RANGE_CENTS) * 50;
              const isSharp = clamped >= 0;

              return (
                <li className={`swara-row verdict-${row.verdict}`} key={row.swara}>
                  <span className="swara-name">{row.swara}</span>
                  <span
                    className="swara-bar"
                    role="img"
                    aria-label={`${row.swara}: ${describeVerdict(row)} over ${row.attempts} attempts`}
                  >
                    <span className="swara-axis" />
                    <span
                      className="swara-fill"
                      style={{
                        left: isSharp ? "50%" : `${50 - width}%`,
                        width: `${Math.max(width, 1)}%`
                      }}
                    />
                  </span>
                  <span className="swara-value">
                    {row.verdict === "insufficient"
                      ? `${row.attempts}x`
                      : `${row.meanCents > 0 ? "+" : ""}${row.meanCents}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="muted swara-legend">Average cents from target: left is flat, right is sharp.</p>
        </>
      ) : (
        <p className="muted">
          Per-swara tendencies appear once you have recorded notes with a sargam label on the
          Sargam or Practice pages.
        </p>
      )}
    </div>
  );
}
