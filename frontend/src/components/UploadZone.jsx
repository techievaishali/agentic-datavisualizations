import { useRef, useState } from "react";

export default function UploadZone({ onUpload, onGenerateReport, generateReportDisabled = false }) {
  const SUPPORTED_EXTENSIONS = ["csv", "xls", "xlsx", "xml"];
  const SUPPORTED_MIME_TYPES = [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/xml",
    "text/xml",
  ];
  const UNSUPPORTED_FILE_MESSAGE = "Unsupported file format. Please upload CSV, Excel, or XML";
  const [dragging, setDragging] = useState(false);
  const [datasetName, setDatasetName] = useState("");
  const [error, setError] = useState("");
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const inputRef = useRef(null);

  const inferDatasetName = (file) => {
    const raw = (file?.name || "dataset").replace(/\.[^.]+$/, "").trim();
    return raw || "dataset";
  };

  const isSupportedFile = (file) => {
    const name = file?.name || "";
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const mimeType = String(file?.type || "").toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(extension) || SUPPORTED_MIME_TYPES.includes(mimeType);
  };

  const handleFileSelection = async (file, inputElement) => {
    if (!file) return;
    await processFile(file);
    // Clear value so selecting the same file again still triggers onChange.
    if (inputElement) {
      inputElement.value = "";
    }
  };

  const processFile = async (file) => {
    if (!isSupportedFile(file)) {
      setHasUploadedFile(false);
      setError(UNSUPPORTED_FILE_MESSAGE);
      return;
    }

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
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.value = "";
            }
            inputRef.current?.click();
          }}
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
          onChange={(e) => handleFileSelection(e.target.files?.[0], e.target)}
        />
      </div>
      {error && (
        <div className="upload-format-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}
    </section>
  );
}
