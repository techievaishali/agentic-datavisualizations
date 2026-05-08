import { useRef, useState } from "react";

export default function UploadZone({ onUpload }) {
  const [dragging, setDragging] = useState(false);
  const [datasetName, setDatasetName] = useState("");
  const [error, setError] = useState("");
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
  };

  return (
    <section className="card">
      <h3>Upload Data Source</h3>
      <p style={{ marginBottom: "8px" }}>Supports CSV, Excel, XML.</p>
      <input
        placeholder="Dataset name"
        value={datasetName}
        onChange={(e) => setDatasetName(e.target.value)}
        style={{ marginBottom: "8px" }}
      />

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
        <button type="button" onClick={() => inputRef.current?.click()}>
          Browse File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.xml"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
