export function SelectedNoteCard({ note }) {
  return (
    <div className="info-card selected-note-card">
      <p className="eyebrow">Selected target</p>
      <div className="selected-note">
        <span>{note.sargam}</span>
        <strong>{note.note}</strong>
      </div>
      <dl>
        <div>
          <dt>Target frequency</dt>
          <dd>{note.frequency.toFixed(2)} Hz</dd>
        </div>
        <div>
          <dt>Mapping</dt>
          <dd>
            {note.note} = {note.sargam}
          </dd>
        </div>
      </dl>
    </div>
  );
}

