# Swagger API Integration Test Summary (2026-05-24)

## Objective
Validate API integration behavior for every Swagger/OpenAPI node in the backend application, covering auth, datasets, reports, widgets, dashboard, and health routes.

## Scope
- Source of truth: `app.openapi()` from backend app.
- Test file generated: `backend/tests/test_swagger_generated_api.py`.
- Coverage target: each documented endpoint-method pair in Swagger.

## Execution Details
- Command:
  - `..\.venv\Scripts\python.exe -m pytest tests/test_swagger_generated_api.py -q`
- Environment:
  - Backend project at `backend/`
  - Pytest configured via `backend/pytest.ini`

## Endpoint/Method Coverage
1. `GET /health`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `POST /api/auth/refresh`
5. `GET /api/auth/me`
6. `POST /api/datasets/upload`
7. `POST /api/datasets/ingest-sql` (validation-path coverage)
8. `GET /api/datasets`
9. `GET /api/datasets/{dataset_id}`
10. `GET /api/datasets/{dataset_id}/records`
11. `DELETE /api/datasets/{dataset_id}`
12. `POST /api/reports/generate`
13. `GET /api/reports/{report_id}`
14. `GET /api/reports`
15. `POST /api/reports/{report_id}/kpis`
16. `GET /api/reports/{report_id}/business-insights`
17. `POST /api/widgets`
18. `GET /api/widgets`
19. `PUT /api/widgets/{widget_id}`
20. `POST /api/widgets/{widget_id}/summary`
21. `DELETE /api/widgets/{widget_id}`
22. `GET /api/dashboard/{dataset_id}`

## Results
- **Passed:** 21 tests
- **Failed:** 0 tests
- **Warnings:** 76 (JWT library deprecation warning from dependency, no functional failures)
- Pytest output excerpt:
  - `..................... [100%]`
  - `21 passed, 76 warnings in 9.58s`

## Issues Found
- No functional endpoint failures in generated Swagger-node integration tests.
- Non-blocking warning observed from dependency (`python-jose`) using deprecated `datetime.utcnow()`.

## Resolution / Follow-up
- Current system behavior is functionally valid for tested API nodes.
- Optional improvement: update/pin JWT dependency stack or patch token time handling to remove deprecation warning in future maintenance.

## Evidence
- Test suite: `backend/tests/test_swagger_generated_api.py`
- Run log: terminal execution from pytest command above.
