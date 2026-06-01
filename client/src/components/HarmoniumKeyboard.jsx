export function HarmoniumKeyboard({ notes, selectedNote, onSelect }) {
  return (
    <div className="keyboard-panel">
      <div className="section-heading">
        <p className="eyebrow">Target note</p>
        <h3>Harmonium keyboard</h3>
      </div>
      <div className="harmonium-keyboard" role="list" aria-label="Harmonium notes">
        {notes.map((note) => {
          const isSelected = selectedNote.note === note.note;

          return (
            <button
              className={`harmonium-key ${isSelected ? "selected" : ""}`}
              key={note.note}
              type="button"
              onClick={() => onSelect(note)}
              aria-pressed={isSelected}
            >
              <span>{note.sargam}</span>
              <strong>{note.note}</strong>
              <small>{note.frequency.toFixed(2)} Hz</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

