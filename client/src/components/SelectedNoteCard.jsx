export function SelectedNoteCard({ note }) {
  const label = note.sargam || "Ref";

  return (
    <div className="info-card selected-note-card">
      <p className="eyebrow">Selected target</p>
      <div className="selected-note">
        <span>{label}</span>
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
            {note.sargam ? `${note.note} = ${note.sargam}` : `${note.note} reference`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
