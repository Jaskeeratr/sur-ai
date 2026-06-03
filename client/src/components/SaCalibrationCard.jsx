import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import { RecordingControls } from "./RecordingControls.jsx";

export function SaCalibrationCard({ calibration, disabled, isCalibrating, onRecordingReady }) {
  return (
    <div className="calibration-card">
      <div className="calibration-heading">
        <SlidersHorizontal size={19} />
        <div>
          <p className="eyebrow">Sa calibration</p>
          <h3>Find my Sa</h3>
        </div>
      </div>

      <RecordingControls
        disabled={disabled}
        isAnalyzing={isCalibrating}
        onRecordingReady={onRecordingReady}
        eyebrow="Calibration sample"
        title="Sing your comfortable Sa"
        recordingTitle="Listening for your Sa"
        description="Record the note you naturally use as Sa. The app will set the closest harmonium key."
        recordingDescription="Hold one steady Sa, then stop recording."
        startLabel="Calibrate Sa"
        analyzingLabel="Calibrating"
      />

      {calibration ? (
        <div className={`calibration-result ${calibration.analysis_status}`}>
          <CheckCircle2 size={18} />
          <div>
            <strong>
              {calibration.suggested_note
                ? `${calibration.suggested_note} selected as Sa`
                : "No steady Sa detected"}
            </strong>
            <span>
              {calibration.average_frequency
                ? `${calibration.average_frequency} Hz detected`
                : calibration.feedback}
              {calibration.cents_from_suggested != null
                ? `, ${Math.abs(Math.round(calibration.cents_from_suggested))} cents from the key`
                : ""}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
