# Implementation Guide

## A. Core ingestion logic (6 steps)

1. Receive source data (upload or SQL query endpoint).
2. Detect source type adapter (csv/excel/xml/sql).
3. Standardize schema names and infer data types.
4. Apply data massage rules (trim, parse, deduplicate, null treatment).
5. Compute profile + quality score.
6. Save curated dataset and emit dynamic reporting process.

Code path:

- backend/app/agents/ingestion_agent.py
- backend/app/routers/datasets.py

## B. Visualization and dynamic reports (7 steps)

1. Build column profile (numeric, categorical, datetime).
2. Generate chart candidates from profile.
3. Score and rank chart suggestions.
4. Generate KPI cards for top numeric measures.
5. Build period aggregations (daily to yearly).
6. Package report spec with theme defaults.
7. Persist report and initialize widget configurations.

Code path:

- backend/app/agents/visualization_agent.py
- backend/app/agents/report_orchestrator.py
- backend/app/routers/reports.py

## C. React dashboard build steps (8 steps)

1. Bootstrap app with Vite + React.
2. Add authentication screen.
3. Implement drag-and-drop upload component.
4. Add dataset selection and report period controls.
5. Trigger auto report generation.
6. Create configurable widget cards.
7. Render chart widgets using chart library.
8. Persist customization via widget CRUD APIs.

Code path:

- frontend/src/App.jsx
- frontend/src/components/UploadZone.jsx
- frontend/src/components/WidgetCard.jsx
- frontend/src/components/ChartRenderer.jsx

## D. Integration and stability metrics (9 steps)

1. Start backend server.
2. Start frontend server.
3. Register/login and obtain token.
4. Upload source dataset.
5. Generate report and widgets.
6. Verify dashboard rendering.
7. Modify widget and validate CRUD persistence.
8. Execute backend tests.
9. Track latency, success rates, and data quality scores.

Recommended metrics:

- Ingestion success rate.
- P95 report generation time.
- Dashboard load duration.
- Widget update success rate.
- Authentication failure/denial events.
