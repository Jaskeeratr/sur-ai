import {
  CartesianGrid,
  ReferenceLine,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

function getGraphStats(data) {
  if (!data.length) {
    return null;
  }

  const detected = data.map((point) => point.detected).filter((value) => Number.isFinite(value));
  if (!detected.length) {
    return null;
  }

  const first = detected[0];
  const last = detected[detected.length - 1];
  const min = Math.min(...detected);
  const max = Math.max(...detected);
  const average = detected.reduce((sum, value) => sum + value, 0) / detected.length;
  const drift = last - first;

  return {
    average,
    min,
    max,
    range: max - min,
    drift,
    direction: Math.abs(drift) < 1.5 ? "steady" : drift > 0 ? "rising" : "falling"
  };
}

export function PitchGraph({ data, targetFrequency }) {
  const stats = getGraphStats(data);
  const domainMin = stats ? Math.max(0, Math.floor(Math.min(stats.min, targetFrequency) - 35)) : Math.max(0, Math.floor(targetFrequency - 90));
  const domainMax = stats ? Math.ceil(Math.max(stats.max, targetFrequency) + 35) : Math.ceil(targetFrequency + 90);

  return (
    <div className="info-card graph-card">
      <div className="section-heading">
        <p className="eyebrow">Pitch contour</p>
        <h3>Recorded voice movement</h3>
      </div>

      {data.length ? (
        <>
          {stats ? (
            <div className="pitch-summary">
              <div>
                <span>Average</span>
                <strong>{stats.average.toFixed(2)} Hz</strong>
              </div>
              <div>
                <span>Low / High</span>
                <strong>
                  {stats.min.toFixed(1)} - {stats.max.toFixed(1)} Hz
                </strong>
              </div>
              <div>
                <span>Movement</span>
                <strong className={`movement-${stats.direction}`}>
                  {stats.direction} {stats.drift > 0 ? "+" : ""}
                  {stats.drift.toFixed(1)} Hz
                </strong>
              </div>
            </div>
          ) : null}
          <div className="graph-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#d9e2dc" strokeDasharray="4 4" />
                <XAxis
                  dataKey="time"
                  label={{ value: "Seconds", position: "insideBottom", offset: -4 }}
                  tick={{ fill: "#53635b", fontSize: 12 }}
                />
                <YAxis
                  domain={[domainMin, domainMax]}
                  tick={{ fill: "#53635b", fontSize: 12 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${Number(value).toFixed(name === "cents" ? 0 : 2)}${name === "cents" ? " cents" : " Hz"}`,
                    name === "detected" ? "recorded voice" : name
                  ]}
                  labelFormatter={(value) => `${value}s`}
                />
                <ReferenceLine
                  y={targetFrequency}
                  stroke="#1f6f5b"
                  strokeDasharray="6 4"
                  label={{ value: "target", position: "insideTopRight", fill: "#1f6f5b", fontSize: 12 }}
                />
                {stats ? (
                  <ReferenceLine
                    y={stats.average}
                    stroke="#6a5b46"
                    strokeDasharray="3 5"
                    label={{ value: "avg", position: "insideBottomRight", fill: "#6a5b46", fontSize: 12 }}
                  />
                ) : null}
                <Line type="monotone" dataKey="target" stroke="#1f6f5b" dot={false} strokeWidth={1} strokeOpacity={0.35} />
                <Line type="monotone" dataKey="detected" stroke="#b54b35" dot={false} strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="empty-graph">Pitch graph appears after analysis.</div>
      )}
    </div>
  );
}
