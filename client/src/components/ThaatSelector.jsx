import { Music4 } from "lucide-react";
import { THAATS, getThaat } from "../data/thaats.js";

export function ThaatSelector({ thaat, onChange }) {
  return (
    <div className="thaat-selector">
      <label>
        <Music4 size={17} aria-hidden="true" />
        <span>Thaat</span>
        <select
          value={thaat.id}
          onChange={(event) => onChange(getThaat(event.target.value))}
        >
          {THAATS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <em>{thaat.description}</em>
    </div>
  );
}
