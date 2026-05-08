# Agentic AI Data Visualization for E-commerce

This repository provides a fully working end-to-end solution for autonomous data visualization with heterogeneous data sources.

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

## Quick start in VS Code

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
2. Upload a CSV/Excel/XML using drag-and-drop.
3. Select reporting period and click auto generate report.
4. Edit widgets to customize chart type, colors, pattern, and fields.
5. Refresh dashboard state to load saved API data.

## API overview

- Auth: `/api/auth/register`, `/api/auth/login`
- Datasets: `/api/datasets/upload`, `/api/datasets/ingest-sql`, `/api/datasets`
- Reports: `/api/reports/generate`, `/api/reports`
- Widgets: `/api/widgets` (create, list, update, delete)
- Dashboard: `/api/dashboard/{dataset_id}`

## Testing

```powershell
cd backend
pytest
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
