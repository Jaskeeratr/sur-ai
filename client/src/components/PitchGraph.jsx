import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export function PitchGraph({ data, targetFrequency }) {
  return (
    <div className="info-card graph-card">
      <div className="section-heading">
        <p className="eyebrow">Pitch contour</p>
        <h3>Target vs detected</h3>
      </div>

      {data.length ? (
        <div className="graph-wrap">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 12, right: 14, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#d9e2dc" strokeDasharray="4 4" />
              <XAxis
                dataKey="time"
                label={{ value: "Seconds", position: "insideBottom", offset: -4 }}
                tick={{ fill: "#53635b", fontSize: 12 }}
              />
              <YAxis
                domain={[
                  Math.max(0, Math.floor(targetFrequency - 90)),
                  Math.ceil(targetFrequency + 90)
                ]}
                tick={{ fill: "#53635b", fontSize: 12 }}
                width={44}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${Number(value).toFixed(name === "cents" ? 0 : 2)}${name === "cents" ? " cents" : " Hz"}`,
                  name
                ]}
                labelFormatter={(value) => `${value}s`}
              />
              <Line type="monotone" dataKey="target" stroke="#1f6f5b" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="detected" stroke="#b54b35" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-graph">Pitch graph appears after analysis.</div>
      )}
    </div>
  );
}

