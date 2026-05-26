import { useRef, useState } from "react";

export default function UploadZone({ onUpload, onGenerateReport, generateReportDisabled = false }) {
  const [dragging, setDragging] = useState(false);
  const [datasetName, setDatasetName] = useState("");
  const [error, setError] = useState("");
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const inputRef = useRef(null);

  const inferDatasetName = (file) => {
    const raw = (file?.name || "dataset").replace(/\.[^.]+$/, "").trim();
    return raw || "dataset";
  };

  const processFile = async (file) => {
    const finalName = datasetName.trim() || inferDatasetName(file);
    setDatasetName(finalName);
    setError("");
    await onUpload(finalName, file);
    setHasUploadedFile(true);
  };

  const generateEnabled = Boolean(onGenerateReport) && hasUploadedFile && !generateReportDisabled;

  return (
    <section className="card">
      <h3>Upload Data Source</h3>
      <p style={{ marginBottom: "8px" }}>Supports CSV, Excel, XML.</p>
      <div className="upload-name-row">
        <input
          id="upload-dataset-name"
          name="dataset_name"
          placeholder="Dataset name"
          autocomplete="off"
          value={datasetName}
          onChange={(e) => setDatasetName(e.target.value)}
        />
        <button
          type="button"
          className="upload-file-btn"
          onClick={() => inputRef.current?.click()}
        >
          Upload File
        </button>
      </div>

      <div
        className={`upload-zone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) {
            processFile(e.dataTransfer.files[0]);
          }
        }}
      >
        <p>Drop your data file here</p>
        <div className="upload-actions">
        <button
          type="button"
          className={`upload-generate-btn ${generateEnabled ? "is-enabled" : ""}`}
          onClick={() => onGenerateReport?.()}
          disabled={!generateEnabled}
        >
          Generate Report
        </button>
        </div>
        <input
          id="upload-file-input"
          name="file_upload"
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.xml"
          autocomplete="off"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
