# Agentic AI Data Visualization for E-commerce

This repository provides autonomous data visualization with heterogeneous data sources.

## What this solution includes

- Python FastAPI backend with agent modules:
  - Ingestion Agent for CSV/Excel/XML/SQL source ingestion and massaging.
  - Visualization Agent for dynamic chart/KPI suggestions.
  - Report Orchestrator Agent for period-wise dynamic reports.
  - Audit Agent for security and traceability.
- Secure APIs with JWT-based authentication and CRUD operations for datasets, reports, and widgets.
- React frontend dashboard with drag-and-drop upload and configurable widget settings:
  - Widget chart type
  - X/Y fields
  - Custom colors
  - Pattern setting
- Baseline tests and CI workflow.
- Documentation package covering architecture, ethical/security controls, project planning, and technical report structure.

## Project structure

- backend: FastAPI services, agent modules, tests.
- frontend: React + Vite dashboard.
- docs: architecture blueprint, implementation guide, project report draft, CI/CD reflection.
- .github/workflows: CI pipeline.

## Quick start (Automated)

To start all services at once (kills any existing processes and restarts them fresh):

**Windows:**
```powershell
.\start-services.bat
# OR directly with PowerShell:
.\start-services.ps1
```

**Linux/macOS:**
```bash
chmod +x start-services.sh
./start-services.sh
```

This will:
- Kill any running backend/frontend processes
- Start the backend (FastAPI on port 8000)
- Start the frontend (React/Vite on port 5173)
- Display access URLs

Optional flags:
```powershell
.\start-services.ps1 -NoBackend    # Skip backend, start frontend only
.\start-services.ps1 -NoFrontend   # Skip frontend, start backend only
```

## Quick start in VS Code (Manual)

## 1) Backend setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend health endpoint:

```text
GET http://127.0.0.1:8000/health
```

## 2) Frontend setup

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend app:

```text
http://127.0.0.1:5173
```

## 3) Demo workflow

1. Register and login.
2. Open the `Upload` tab and upload a CSV/Excel/XML file using drag-and-drop or browse.
3. Click `Generate Report` to create charts, KPIs, and weekly metrics.
4. Review the `Overview` tab for KPI snapshots, charts, highlights, and weekly aggregated metrics.
5. Open `Analytics` (or click `Configure Dashboard`) to customize widget chart type, colors, pattern, and fields.

## Optional: Enable LangChain AI Report Summary

The report generator now includes an `ai_summary` section in `report_spec`.
If no LLM provider is configured, the app uses a deterministic fallback summary.

### A) Gemini free tier (recommended)

Set environment variables before starting backend:

```powershell
$env:LLM_PROVIDER="google"
$env:LLM_MODEL="gemini-1.5-flash"
$env:GOOGLE_API_KEY="<your_google_api_key>"
```

### B) Local Ollama

Start Ollama locally and pull a model, then set:

```powershell
$env:LLM_PROVIDER="ollama"
$env:LLM_MODEL="llama3.1:8b"
$env:OLLAMA_BASE_URL="http://localhost:11434"
```

If not set, `LLM_PROVIDER` defaults to `none` and the fallback summary is used.

## API overview

- Auth: `/api/auth/register`, `/api/auth/login`
- Datasets: `/api/datasets/upload`, `/api/datasets/ingest-sql`, `/api/datasets`
- Reports: `/api/reports/generate`, `/api/reports`
- Widgets: `/api/widgets` (create, list, update, delete)
- Dashboard: `/api/dashboard/{dataset_id}`

## Testing

Backend tests:

```powershell
cd backend
pytest
```

Frontend tests:

```powershell
cd frontend
npm test
```

Optional frontend test modes:

```powershell
npm run test:watch
npm run test:coverage
```

## Security baseline

- JWT authentication.
- Role model scaffold (`admin`, `analyst`).
- Audit logging for major CRUD and agent actions.
- Input constraints and controlled upload types.

## Academic documentation

See the docs folder for:

- System architecture blueprint and module specifications.
- Ethical/security analysis and mitigation design.
- Gantt chart, resource table, feasibility checklist.
- CI/CD reflection and deployment planning.
- Technical report template with citations.
