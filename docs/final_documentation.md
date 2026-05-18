# Agentic AI Data Visualization System
## Final Developer Documentation — End to End

**Version:** 1.0  
**Date:** April 29, 2026  
**Author:** [Your Name]  
**Status:** Production-Ready Prototype

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement and Objectives](#2-problem-statement-and-objectives)
3. [Architecture Diagram and Layer Design](#3-architecture-diagram-and-layer-design)
4. [Technical Stack — Detailed](#4-technical-stack--detailed)
5. [Module Specification — Input, Method, Output](#5-module-specification--input-method-output)
6. [API Specification](#6-api-specification)
7. [Data Model and Storage Design](#7-data-model-and-storage-design)
8. [Security Design](#8-security-design)
9. [Functional Requirements (FR)](#9-functional-requirements-fr)
10. [Non-Functional Requirements (NFR)](#10-non-functional-requirements-nfr)
11. [FR and NFR Traceability Matrix](#11-fr-and-nfr-traceability-matrix)
12. [Testing Strategy](#12-testing-strategy)
13. [Deployment and DevOps](#13-deployment-and-devops)
14. [Monitoring and Observability](#14-monitoring-and-observability)
15. [Demo Guide — Step by Step](#15-demo-guide--step-by-step)
16. [Presentation Deck Outline](#16-presentation-deck-outline)
17. [Risks and Limitations](#17-risks-and-limitations)
18. [Future Roadmap](#18-future-roadmap)
19. [Milestones and Challenges](#19-milestones-and-challenges)
20. [Conclusion](#20-conclusion)

---

## 1. Project Overview

The **Agentic AI Data Visualization System** is a full-stack, enterprise-grade analytics platform that automates the end-to-end pipeline from raw dataset upload to interactive dashboards and exported reports. It is designed for e-commerce and data-intensive business environments.

The platform eliminates the need for manual data cleaning, report configuration, and chart selection by using an intelligent multi-agent backend pipeline. The system combines a React 18 SPA frontend with a FastAPI REST backend, SQLAlchemy ORM persistence, and modular AI-assisted agents.

### Core Value Proposition

| Pain Point | System Response |
|---|---|
| Fragmented data formats | Multi-format ingestion with automatic parsing |
| Poor data quality | Automated cleaning, profiling, and quality scoring |
| Manual report building | Heuristic agent-driven chart suggestions and report orchestration |
| Slow decision cycles | Dashboard-first workflow, instant visualization on upload |
| Uncontrolled data access | JWT authentication + RBAC across all API operations |
| No audit trail | Audit agent captures all sensitive operations |

---

## 2. Problem Statement and Objectives

### 2.1 Problem Context

E-commerce organizations accumulate business data from multiple systems — sales orders, customer records, marketing metrics — in formats including CSV, XLSX, and XML. Converting this data into actionable dashboards requires time-consuming manual effort from analysts who must clean, normalize, profile, and visualize data by hand.

This leads to:
- Delayed analytical outputs.
- Inconsistent data quality across reports.
- Lack of scalable, governed access for multiple business users.

### 2.2 Formal Problem Statement

Design and implement an agent-driven, secure, and scalable web platform that:
1. Accepts heterogeneous e-commerce datasets without manual transformation.
2. Automatically ensures data quality through cleaning, normalization, and profiling.
3. Intelligently recommends and generates visualizations from dataset characteristics.
4. Supports multi-user, role-differentiated access with auditability.
5. Enables report and dashboard export for business stakeholders.

### 2.3 SMART Objectives

1. **Specific:** Deliver multi-format ingestion, automated processing, and visualization recommendation for uploaded datasets.
2. **Measurable:** Support CSV, XLSX, and XML parsing; generate up to 8 ranked chart suggestions per dataset.
3. **Achievable:** Use established frameworks — FastAPI, React 18, Pandas, SQLAlchemy.
4. **Relevant:** Directly addresses the manual analytics bottleneck in e-commerce analytics teams.
5. **Time-bound:** Complete core prototype by end of capstone period.

---

## 3. Architecture Diagram and Layer Design

### 3.1 High-Level Architecture

```
┌────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                        │
│         React 18 SPA — Web Browser                    │
│  Roles: Admin | Analyst | Viewer                      │
└──────────────────────┬─────────────────────────────────┘
                       │ HTTPS
┌──────────────────────┴─────────────────────────────────┐
│                   FRONTEND LAYER                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Upload Zone │  │   Dashboard  │  │ Export (PDF) │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  │
│         └──────── State Management ───────────┘        │
└──────────────────────┬─────────────────────────────────┘
                       │ HTTPS / JSON REST
┌──────────────────────┴─────────────────────────────────┐
│           API GATEWAY & SECURITY LAYER                 │
│  FastAPI ─── JWT Auth ─── RBAC ─── Pydantic Validate  │
└──────────────────────┬─────────────────────────────────┘
                       │ Internal async calls
┌──────────────────────┴─────────────────────────────────┐
│           BACKEND INTELLIGENCE LAYER                   │
│  ┌──────────────┐  ┌───────────────┐                  │
│  │Upload Handler│→ │Data Processor │                   │
│  └──────────────┘  └───────┬───────┘                  │
│                            ↓                           │
│                   ┌────────────────┐                   │
│                   │ Data Profiler  │                   │
│                   └───────┬────────┘                   │
│                           ↓                            │
│             ┌─────────────────────────┐                │
│             │ Visualization Agent     │                 │
│             └──────────┬──────────────┘                │
│                        ↓                               │
│             ┌─────────────────────────┐                │
│             │ Report Orchestrator     │                 │
│             └──────────┬──────────────┘                │
│  ┌──────────────────── ↓ ──────────────────────────┐   │
│  │ Audit Logger     Report Router     CRUD APIs    │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────┬─────────────────────────────────┘
                       │ SQL / Cache I/O / File I/O
┌──────────────────────┴─────────────────────────────────┐
│                    DATA LAYER                          │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Relational  │  │  Cache   │  │  File Storage    │ │
│  │  Database    │  │ (memory) │  │  raw + curated   │ │
│  └──────────────┘  └──────────┘  └──────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow — End to End

```
User Uploads File
        ↓
[Upload Handler] — validates format, parses records
        ↓
[Data Processor] — cleans, normalizes, deduplicates, type-coerces
        ↓
[Data Profiler] — computes stats, quality metrics, schema info
        ↓
[Visualization Agent] — scores and ranks chart type candidates
        ↓
[Report Orchestrator] — generates daily/weekly/monthly/quarterly/yearly aggregations
        ↓
[Persistence Layer] — saves dataset, report, widgets, audit events
        ↓
[Frontend Dashboard] — renders widgets, chart selector, data quality panel
        ↓
[Export Module] — generates downloadable PDF report
```

### 3.3 Authentication Flow

```
POST /api/auth/login (username + password)
        ↓
Hash comparison (pbkdf2_sha256)
        ↓
JWT Token generated (claims: user_id, role, exp=24h, algorithm=HS256)
        ↓
Token returned to frontend
        ↓
Frontend sends Bearer token in Authorization header
        ↓
Backend middleware validates signature + expiry
        ↓
RBAC: role checked against endpoint policy
        ↓
Request granted or 401/403 returned
```

### 3.4 Deployment Architecture

```
┌─────────────┐
│    CDN      │ ← React build artifacts (HTML, CSS, JS)
└──────┬──────┘
       │
┌──────┴────────────────────────┐
│  Load Balancer (nginx/HAProxy)│
└──────┬────────────────────────┘
       │
┌──────┴────────────────────────────────────────┐
│  Application Servers                          │
│  ┌──────────────┐  ┌──────────────┐           │
│  │ FastAPI Pod 1│  │ FastAPI Pod 2│  ...       │
│  └──────────────┘  └──────────────┘           │
│         (Kubernetes Pods)                     │
└──────┬────────────────────────────────────────┘
       │
┌──────┴────────────────────────────────────────┐
│  Services                                     │
│  ┌──────────────┐ ┌──────────┐ ┌───────────┐  │
│  │  PostgreSQL  │ │  Redis   │ │  S3/Files │  │
│  └──────────────┘ └──────────┘ └───────────┘  │
└───────────────────────────────────────────────┘
```

---

## 4. Technical Stack — Detailed

### 4.1 Backend Stack

| Component | Version | Purpose | Notes |
|---|---|---|---|
| Python | 3.12 | Core runtime | All backend logic |
| FastAPI | 0.115.5 | REST API framework | Async, auto-docs, Pydantic integration |
| SQLAlchemy | 2.0.36 | ORM | Declarative models, migration-ready |
| Pydantic | 2.10.3 | Request/response validation | Schema enforcement at boundary |
| Pandas | 2.2.3 | Data manipulation | Profiling, cleaning, aggregation |
| scikit-learn | 1.5.2 | ML utilities | Feature support for future scoring models |
| passlib | Latest | Password hashing | pbkdf2_sha256 algorithm |
| python-jose | Latest | JWT token handling | HS256 signing and verification |
| uvicorn | Latest | ASGI server | Production-grade async server |
| pytest | Latest | Test framework | Unit and integration coverage |

### 4.2 Frontend Stack

| Component | Version | Purpose | Notes |
|---|---|---|---|
| React | 18 | UI component framework | Hooks-based, SPA |
| Vite | 5 | Build tool | Fast HMR, code-splitting |
| Recharts | 2.13 | Chart components | Line, Bar, Scatter, Pie, KPI |
| Axios | 1.7 | HTTP client | API calls with token injection |
| jsPDF | 4.2.1 | PDF generation | Client-side report artifact |
| html2canvas | 1.4.1 | DOM to canvas | Capture widget screenshots for PDF |
| React Hooks | 18 built-in | State management | useState, useContext, useReducer |

### 4.3 Data and Infrastructure

| Component | Purpose | Production Path |
|---|---|---|
| SQLite | Development database | File-based, no setup |
| PostgreSQL | Production database | ORM-compatible drop-in |
| In-memory dict/cache | Aggregation caching | Redis-ready interface |
| Local filesystem | Raw and curated file storage | S3/cloud storage in production |

### 4.4 Developer Tooling

| Tool | Purpose |
|---|---|
| Git | Source control |
| GitHub Actions | CI/CD pipeline |
| pytest + pytest-asyncio | Backend testing |
| Vitest | Frontend component testing |
| Black / Ruff | Python code formatting and linting |
| ESLint | Frontend linting |
| Swagger/OpenAPI (auto) | API documentation via FastAPI |

---

## 5. Module Specification — Input, Method, Output

### 5.1 Authentication and Authorization Module

**Location:** `backend/app/routers/auth.py`, `backend/app/security.py`

| Field | Detail |
|---|---|
| **Input** | Username, password, Authorization Bearer header |
| **Methodology** | Credential lookup from DB, pbkdf2_sha256 hash comparison, JWT token generation with role and expiry claims, middleware token verification on protected routes |
| **Output** | Access token (JWT), authenticated identity context, role-based route decision |
| **Error Handling** | 401 Unauthorized on invalid credentials; 403 Forbidden on insufficient role |
| **Security Controls** | Token expiry 24h, CORS policy, RBAC enforcement |

### 5.2 Dataset Upload and Validation Module

**Location:** `backend/app/routers/datasets.py`, `backend/app/agents/ingestion_agent.py`

| Field | Detail |
|---|---|
| **Input** | File (CSV, XLSX, XML) and dataset metadata (name, description) |
| **Methodology** | MIME/extension validation, parser routing by format, schema sanity checks, staging to file store |
| **Output** | Parsed dataset object, dataset DB record, validation error payload |
| **Supported Formats** | CSV, Excel (.xlsx), XML |
| **Error Handling** | 400 on invalid format; detailed field-level error messages |

### 5.3 Data Processor Module

**Location:** `backend/app/agents/ingestion_agent.py`

| Field | Detail |
|---|---|
| **Input** | Parsed raw dataframe |
| **Methodology** | Forward-fill and drop strategy for nulls, duplicate row removal, string whitespace trimming, column type coercion (datetime, numeric, categorical), column name normalization (lowercase, underscore) |
| **Output** | Curated clean dataframe, saved as curated CSV |
| **Quality Targets** | Zero duplicates, consistent types, standardized column names |

### 5.4 Data Profiler Module

**Location:** `backend/app/agents/ingestion_agent.py`

| Field | Detail |
|---|---|
| **Input** | Curated dataset |
| **Methodology** | Per-column: type detection, null count/percentage, unique count, min/max/mean/std, cardinality classification; full dataset: shape, correlation matrix |
| **Output** | Profiling metadata dict, data quality score, schema summary |
| **Frontend Exposure** | Quality panel in dashboard showing per-column health |

### 5.5 Visualization Recommendation Agent

**Location:** `backend/app/agents/visualization_agent.py`

| Field | Detail |
|---|---|
| **Input** | Schema metadata, column type profile |
| **Methodology** | Heuristic scoring model (see Table below), deduplication of (chart_type, x_field, y_field) triples, confidence-ranked output, max 8 suggestions |
| **Output** | Ordered list of chart suggestions with type, field assignments, confidence score |

**Heuristic Scoring Table:**

| Condition | Chart Type | Confidence Bonus |
|---|---|---|
| Datetime column + Numeric column | Line Chart | +40 |
| Category column + Numeric column | Bar Chart | +30 |
| Numeric column + Numeric column | Scatter Plot | +25 |
| Single category (cardinality ≤ 10) | Pie Chart | +20 |
| Any numeric column | KPI Widget | +15 |

**Key Methods:**
- `_pick_preferred_metric()` — selects revenue/sales/profit/amount/total/price columns first, then any numeric
- `_pick_preferred_category()` — selects low-cardinality (2–20 unique values) non-ID columns
- `_add_if_unique()` — deduplicates suggestions to maintain diversity
- `suggest()` — master method returning top-N ranked suggestions

### 5.6 Report Orchestrator Module

**Location:** `backend/app/agents/report_orchestrator.py`

| Field | Detail |
|---|---|
| **Input** | Dataset ID, selected metrics, time dimension field, report config |
| **Methodology** | Period-based aggregations: daily (per date), weekly (ISO week), monthly (year-month), quarterly, yearly; fallback grouping by category for non-datetime datasets; NULL-safe aggregation |
| **Output** | Report payload with all period buckets, widget-ready series data |
| **Fallback** | For non-datetime datasets: group by first categorical column and aggregate |

### 5.7 Widget and Dashboard Service

**Location:** `backend/app/routers/widgets.py`, `frontend/src/components/WidgetCard.jsx`

| Field | Detail |
|---|---|
| **Input** | Chart type, x_field, y_field, title, report_id, visual settings |
| **Methodology** | Widget CRUD operations via ORM; chart config persisted as JSON; frontend renders using Recharts; user can change chart type, colors, delete |
| **Output** | Saved widget record, rendered interactive chart in dashboard |
| **Supported Charts** | Line, Bar, Scatter, Pie, KPI |

### 5.8 Export Module

**Location:** `frontend/src/components/` (export logic)

| Field | Detail |
|---|---|
| **Input** | Selected widget IDs, dashboard metadata |
| **Methodology** | html2canvas captures each selected widget at 2x scale; jsPDF stitches captures into multi-page PDF with metadata header |
| **Output** | Downloadable PDF report artifact |
| **Settings** | Full dashboard export or selected widgets only |

### 5.9 Persistence and Audit Module

**Location:** `backend/app/db.py`, `backend/app/models.py`, `backend/app/agents/audit_agent.py`

| Field | Detail |
|---|---|
| **Input** | Entity creation/update/delete events, security events |
| **Methodology** | SQLAlchemy session-based transactions; audit_log entries written for auth, upload, delete, and role-change operations |
| **Output** | Durable records in DB, audit trail queryable by admin |
| **Tables** | users, datasets, reports, widgets, audit_logs |

---

## 6. API Specification

### Base URL (Development)
```
http://localhost:8000/api
```

### 6.1 Authentication Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login and receive token |
| GET | `/users/profile` | Yes | Get current user profile |

**Register Request:**
```json
POST /api/auth/register
{
  "email": "analyst@example.com",
  "full_name": "Analyst User",
  "password": "StrongPass123"
}
```

**Login Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "role": "analyst"
}
```

### 6.2 Dataset Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| POST | `/datasets/upload` | Yes | Upload dataset file |
| GET | `/datasets` | Yes | List all datasets |
| GET | `/datasets/{id}` | Yes | Get dataset metadata |
| DELETE | `/datasets/{id}` | Yes (admin/analyst) | Delete dataset |
| GET | `/datasets/{id}/suggestions` | Yes | Get chart suggestions |

**Upload Request:**
```bash
curl -X POST "http://localhost:8000/api/datasets/upload" \
  -H "Authorization: Bearer <token>" \
  -F "dataset_name=q1_sales" \
  -F "file=@sample_sales.csv"
```

**Suggestions Response:**
```json
{
  "dataset_id": 1,
  "suggestions": [
    {
      "chart_type": "line",
      "x_field": "order_date",
      "y_field": "revenue",
      "confidence": 85,
      "title": "Revenue Over Time"
    },
    {
      "chart_type": "bar",
      "x_field": "category",
      "y_field": "revenue",
      "confidence": 70,
      "title": "Revenue by Category"
    }
  ]
}
```

### 6.3 Report Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| POST | `/reports/create` | Yes | Create report |
| GET | `/reports/{id}` | Yes | Retrieve report |
| PUT | `/reports/{id}` | Yes | Update report |
| DELETE | `/reports/{id}` | Yes | Delete report |

**Create Report Request:**
```json
POST /api/reports/create
Authorization: Bearer <token>
{
  "dataset_id": 1,
  "name": "Q1 Sales Analysis",
  "period": "monthly",
  "config": {}
}
```

### 6.4 Widget Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| POST | `/widgets` | Yes | Create widget |
| PUT | `/widgets/{id}` | Yes | Update widget |
| DELETE | `/widgets/{id}` | Yes | Delete widget |

**Create Widget Request:**
```json
POST /api/widgets
Authorization: Bearer <token>
{
  "report_id": 1,
  "title": "Revenue by Category",
  "chart_type": "bar",
  "x_field": "category",
  "y_field": "revenue",
  "settings": { "color": "#4f8ef7" }
}
```

### 6.5 Health Endpoint

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| GET | `/health` | No | System health check |

**Response:**
```json
{ "status": "healthy", "version": "1.0.0" }
```

### 6.6 API Error Code Reference

| HTTP Code | Meaning | Common Trigger |
|---|---|---|
| 200 | OK | Successful GET, PUT |
| 201 | Created | Successful POST |
| 400 | Bad Request | Validation failure, bad file format |
| 401 | Unauthorized | Missing or expired token |
| 403 | Forbidden | Insufficient role |
| 404 | Not Found | Resource does not exist |
| 422 | Unprocessable Entity | Pydantic schema mismatch |
| 500 | Internal Server Error | Unexpected exception |

---

## 7. Data Model and Storage Design

### 7.1 Entity Relationship

```
users
  ├── id (PK)
  ├── username (UNIQUE)
  ├── email (UNIQUE)
  ├── password_hash
  ├── role  [admin | analyst | viewer]
  ├── is_active
  └── created_at

datasets
  ├── id (PK)
  ├── user_id (FK → users.id)
  ├── name
  ├── description
  ├── file_path
  ├── curated_path
  ├── created_at
  └── updated_at

reports
  ├── id (PK)
  ├── user_id (FK → users.id)
  ├── dataset_id (FK → datasets.id)
  ├── name
  ├── config (JSON)
  ├── created_at
  └── updated_at

widgets
  ├── id (PK)
  ├── report_id (FK → reports.id)
  ├── title
  ├── chart_type
  ├── x_field
  ├── y_field
  ├── settings (JSON)
  └── created_at

audit_logs
  ├── id (PK)
  ├── user_id (FK → users.id)
  ├── action  [login | upload | delete | update | export]
  ├── entity_type
  ├── entity_id
  ├── metadata (JSON)
  └── timestamp
```

### 7.2 Relationships Summary

| Relationship | Type | Description |
|---|---|---|
| users → datasets | One-to-Many | A user owns many datasets |
| users → reports | One-to-Many | A user owns many reports |
| datasets → reports | One-to-Many | A dataset has many reports |
| reports → widgets | One-to-Many | A report has many widgets |
| users → audit_logs | One-to-Many | All user actions are logged |

### 7.3 Caching Strategy

| Layer | Mechanism | Invalidation |
|---|---|---|
| Report aggregations | In-memory dict cache | On dataset update or delete |
| Session state | React local state | On page refresh or logout |
| Future: Redis | External cache cluster | TTL-based expiry |

### 7.4 File Storage Layout

```
backend/data/
  raw/          ← original uploaded files (CSV, XLSX, XML)
  curated/      ← cleaned and normalized CSVs
```

---

## 8. Security Design

### 8.1 Security Controls Summary

| Control | Implementation | Standard |
|---|---|---|
| Authentication | JWT (HS256, 24h expiry) | RFC 7519 |
| Password storage | pbkdf2_sha256 (passlib) | NIST SP 800-132 |
| Authorization | RBAC (admin, analyst, viewer) | NIST RBAC Model |
| Input validation | Pydantic schema enforcement | OWASP Input Validation |
| SQL injection prevention | SQLAlchemy ORM (parameterized) | OWASP A03:2021 |
| CORS | FastAPI CORSMiddleware | Browser security policy |
| Audit logging | audit_logs table for sensitive ops | OWASP A09:2021 |
| File upload safety | Extension + MIME validation | OWASP A04:2021 |

### 8.2 RBAC Permission Matrix

| Operation | Admin | Analyst | Viewer |
|---|---|---|---|
| Register/Login | ✅ | ✅ | ✅ |
| Upload dataset | ✅ | ✅ | ❌ |
| View datasets | ✅ | ✅ | ✅ |
| Delete dataset | ✅ | Own only | ❌ |
| Create report | ✅ | ✅ | ❌ |
| View report | ✅ | ✅ | ✅ |
| Delete report | ✅ | Own only | ❌ |
| Create widget | ✅ | ✅ | ❌ |
| Delete widget | ✅ | Own only | ❌ |
| Export PDF | ✅ | ✅ | ✅ |
| View audit logs | ✅ | ❌ | ❌ |

---

## 9. Functional Requirements (FR)

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | System shall authenticate users with credential verification and token issuance | High |
| FR-02 | System shall enforce role-based access control per endpoint | High |
| FR-03 | System shall accept dataset uploads in CSV, XLSX, and XML formats | High |
| FR-04 | System shall validate file format and reject invalid input with descriptive errors | High |
| FR-05 | System shall clean and normalize uploaded dataset records | High |
| FR-06 | System shall compute profiling, schema, and data quality metrics | High |
| FR-07 | System shall generate visualization recommendations ranked by confidence | High |
| FR-08 | System shall support report create, read, update, delete | High |
| FR-09 | System shall support widget create, update, delete | High |
| FR-10 | System shall export selected dashboard views to PDF | Medium |
| FR-11 | System shall persist all datasets, reports, and widget configurations | High |
| FR-12 | System shall maintain an audit log for sensitive operations | Medium |
| FR-13 | System shall display data quality indicators in the dashboard | Medium |
| FR-14 | System shall generate period-based aggregations (daily to yearly) | High |

---

## 10. Non-Functional Requirements (NFR)

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-01 | Performance | API response time for standard reads | < 2 seconds |
| NFR-02 | Performance | Report generation for medium dataset | < 10 seconds |
| NFR-03 | Usability | Upload to first visualization steps | ≤ 5 actions |
| NFR-04 | Reliability | Service availability | 99.5% uptime target |
| NFR-05 | Reliability | Graceful error handling with meaningful messages | All error paths |
| NFR-06 | Scalability | Horizontal scaling of API instances | Stateless design |
| NFR-07 | Scalability | Cache support for repeated aggregation queries | In-memory, Redis-ready |
| NFR-08 | Security | Token expiration and revocation path | 24h, logout-on-expire |
| NFR-09 | Security | No raw SQL exposure; all queries via ORM | All DB access |
| NFR-10 | Maintainability | Modular agent components with single responsibility | All agents |
| NFR-11 | Maintainability | Test coverage target | > 80% |
| NFR-12 | Observability | Structured logs for all error paths | INFO to CRITICAL |
| NFR-13 | Portability | Database swap (SQLite → PostgreSQL) without code change | ORM abstraction |

---

## 11. FR and NFR Traceability Matrix

| Requirement | Maps To | Architecture Component |
|---|---|---|
| FR-01, FR-02 | Authentication and Authorization | `routers/auth.py`, `security.py`, JWT middleware |
| FR-03, FR-04 | Dataset Upload and Validation | `routers/datasets.py`, `agents/ingestion_agent.py` |
| FR-05 | Data Processor | `agents/ingestion_agent.py` |
| FR-06, FR-13 | Data Profiler | `agents/ingestion_agent.py` |
| FR-07 | Visualization Agent | `agents/visualization_agent.py` |
| FR-08, FR-14 | Report Orchestrator + Router | `agents/report_orchestrator.py`, `routers/reports.py` |
| FR-09 | Widget Service | `routers/widgets.py` |
| FR-10 | Export Module | `frontend/src/` (jsPDF + html2canvas) |
| FR-11, FR-12 | Persistence + Audit | `db.py`, `models.py`, `agents/audit_agent.py` |
| NFR-01, NFR-02 | Performance | Cache layer, async FastAPI, aggregation design |
| NFR-03 | Usability | Frontend upload-to-dashboard 5-step flow |
| NFR-06, NFR-07 | Scalability | Stateless JWT API, cache module |
| NFR-08, NFR-09 | Security | JWT, ORM, Pydantic, CORS |
| NFR-10, NFR-11 | Maintainability | Modular agents, pytest suite |
| NFR-12 | Observability | Python logging, audit_logs table |
| NFR-13 | Portability | SQLAlchemy ORM abstraction |

---

## 12. Testing Strategy

### 12.1 Backend Testing

**Framework:** pytest with pytest-asyncio

| Test Type | Scope | Location |
|---|---|---|
| Unit tests | Auth, datasets, health | `backend/tests/` |
| Integration tests | API → service → DB flow | `backend/tests/` |
| Agent tests | Processing, profiling, visualization | Per-agent test cases |

**Key test cases:**
- `test_register_and_login` — validates token issuance
- `test_upload_csv` — validates ingestion pipeline
- `test_chart_suggestions` — validates recommendation output
- `test_report_crud` — validates report lifecycle
- `test_role_restriction` — validates RBAC enforcement
- `test_health` — validates API availability

**Running tests:**
```bash
cd backend
pytest tests/ -v --tb=short
```

### 12.2 Frontend Testing

**Framework:** Vitest

| Test Type | Scope |
|---|---|
| Component tests | UploadZone, WidgetCard, ChartRenderer |
| Integration tests | Auth flow, upload-to-widget pipeline |

### 12.3 Manual Test Checklist

| Scenario | Expected Result |
|---|---|
| Login with valid credentials | Token returned, dashboard loads |
| Login with wrong password | 401 with error message |
| Upload valid CSV | Dataset created, profiling summary shown |
| Upload unsupported file type | 400 validation error shown |
| View chart suggestions | Ranked list rendered |
| Create and delete widget | Widget appears and disappears from dashboard |
| Export PDF | PDF downloads with all selected widgets |
| Access protected route without token | 401 returned |
| Access admin-only route as viewer | 403 returned |

---

## 13. Deployment and DevOps

### 13.1 Local Development Setup

**Prerequisites:**
- Python 3.12
- Node.js 18+
- Git

**Backend Setup:**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend Setup:**
```powershell
cd frontend
npm install
npm run dev
```

**Access:**
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`
- ReDoc docs: `http://localhost:8000/redoc`

### 13.2 Environment Variables

| Variable | Purpose | Example |
|---|---|---|
| `SECRET_KEY` | JWT signing secret | `change_in_production_abc123` |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry | `1440` |
| `DATABASE_URL` | Database connection | `sqlite:///./app.db` |
| `UPLOAD_DIR` | File storage path | `./data/raw` |
| `CURATED_DIR` | Curated data path | `./data/curated` |

### 13.3 CI/CD Pipeline (GitHub Actions)

```
Code Push to main/PR
        ↓
Linting (Ruff / ESLint)
        ↓
Type Checking (Pyright / TypeScript)
        ↓
Backend Tests (pytest)
        ↓
Frontend Build (Vite build)
        ↓
Frontend Tests (Vitest)
        ↓
Build Docker Images
        ↓
Push to Container Registry
        ↓
Deploy to Staging / Production
        ↓
Smoke Tests
```

### 13.4 Docker Setup (Production Path)

```dockerfile
# Backend Dockerfile (simplified)
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 14. Monitoring and Observability

### 14.1 Logging Strategy

| Level | When Used |
|---|---|
| INFO | Request received, processed, completed |
| WARNING | Unexpected but handled conditions |
| ERROR | Recoverable failures with context |
| CRITICAL | System-wide failures requiring immediate attention |

Sensitive data (passwords, tokens) is masked in all log outputs.

### 14.2 Key Metrics to Monitor

| Metric | Threshold / Alert |
|---|---|
| API response time | Alert if P95 > 3s |
| Error rate | Alert if > 2% of requests |
| Dataset processing time | Alert if > 30s |
| Database connection pool | Alert if > 80% utilization |
| Failed login attempts | Alert if > 10 in 60s (brute-force detection) |

### 14.3 Recommended Monitoring Stack

| Concern | Tool |
|---|---|
| Metrics | Prometheus + Grafana |
| Logs | ELK Stack (Elasticsearch, Logstash, Kibana) |
| Tracing | Jaeger or Datadog |
| Alerting | AlertManager or PagerDuty |
| Uptime | UptimeRobot or Pingdom |

---

## 15. Demo Guide — Step by Step

Use this exact sequence for live demonstration to evaluators.

### Step 1 — Introduction (1 minute)
State the problem: analysts manually clean, configure, and build dashboards from raw files.  
State the solution: one upload triggers an agent pipeline that cleans data, recommends charts, and builds the dashboard automatically.

### Step 2 — Authentication Demo
1. Open browser at `http://localhost:5173`
2. Register a new analyst user
3. Login and show the JWT token returned in network tab (DevTools)
4. Show dashboard loads with role-appropriate controls visible

### Step 3 — Dataset Upload
1. Drag and drop `sample_sales.csv` into the Upload Zone
2. Show validation message for file accepted
3. Show dataset appearing in the dataset list
4. Point out: no manual schema mapping was needed

### Step 4 — Data Quality Panel
1. Select the uploaded dataset
2. Show the profiling summary: row count, null percentages, column types
3. Explain: Data Profiler ran automatically after processing

### Step 5 — Visualization Intelligence
1. Navigate to chart suggestions for the dataset
2. Show ranked suggestions: Line chart (85 confidence), Bar chart (70 confidence), etc.
3. Explain the scoring model briefly: datetime + numeric = line preferred

### Step 6 — Report and Dashboard
1. Generate a report with monthly aggregation
2. Show widgets auto-added to the dashboard
3. Demonstrate changing chart type on a widget
4. Demonstrate deleting a widget and re-adding

### Step 7 — Export
1. Select two or three widgets
2. Click Export to PDF
3. Show the downloaded PDF with metadata header and charts rendered

### Step 8 — Security Checkpoint
1. Open Postman or browser network tab
2. Attempt a protected endpoint without token → show 401
3. Login as viewer → attempt upload → show 403

### Step 9 — API Documentation
1. Open `http://localhost:8000/docs`
2. Walk through the Swagger UI showing all endpoint groups
3. Show a live API call from Swagger

### Step 10 — Closing Summary
Summarize: one upload, automated pipeline, dashboard ready, secured access, exportable report.

---

## 16. Presentation Deck Outline

Use this structure for a 15-slide deck.

| Slide | Title | Content |
|---|---|---|
| 1 | Title | Project name, team, date, institution |
| 2 | Problem Statement | 3 core gaps with real-world context |
| 3 | Solution Overview | One-line description, value proposition table |
| 4 | Architecture Diagram | High-level 5-layer diagram |
| 5 | End-to-End Data Flow | Pipeline flow from upload to dashboard |
| 6 | Agent Intelligence | Visualization agent scoring model + table |
| 7 | Technical Stack | Stack table split by frontend/backend/infra |
| 8 | Module Design | Key modules with I/O summary table |
| 9 | Security and Compliance | Auth flow diagram, RBAC matrix |
| 10 | FR and NFR Mapping | Traceability table (condensed) |
| 11 | Testing and Quality | Test types, coverage target, key cases |
| 12 | Deployment | Dev and production architecture diagrams |
| 13 | Live Demo | Follow demo guide steps 1–10 |
| 14 | Challenges and Lessons | 3–4 key technical challenges resolved |
| 15 | Future Roadmap + Q&A | Next enhancements, open for questions |

**Speaker tip for Slide 13:**  
Open the running application and follow the demo guide exactly. Keep browser DevTools open to show real JWT tokens, API calls, and response payloads.

---

## 17. Risks and Limitations

| Risk | Impact | Mitigation |
|---|---|---|
| Large file upload performance | Processing delay > 10s for large datasets | Add async job queue (Celery/RQ) |
| Heuristic recommendation gaps | Poor suggestions for non-standard schemas | Extend scoring rules, add user feedback loop |
| SQLite concurrency limits | Blocked writes under multi-user load | Migrate to PostgreSQL for production |
| Token compromise | Unauthorized access | Short expiry, logout invalidation, refresh tokens |
| XML parsing complexity | Nested or malformed XML fails silently | Robust fallback + error surfacing |
| Client-side PDF quality | Low-res output on complex dashboards | Tune html2canvas scale factor |

---

## 18. Future Roadmap

| Priority | Enhancement | Effort |
|---|---|---|
| High | Async background processing (Celery/RQ) for large files | Medium |
| High | PostgreSQL and Redis integration for production | Low |
| Medium | Adaptive recommendation using user acceptance feedback | High |
| Medium | Real-time data refresh via WebSockets or SSE | Medium |
| Medium | Advanced governance: data lineage and access policies | High |
| Low | Multi-tenant workspace isolation | High |
| Low | Natural language query interface for dashboard generation | High |
| Low | Streaming data source connectors (Kafka, S3 events) | High |

---

## 19. Milestones and Challenges

### 19.1 Milestone Summary

| # | Milestone | Status | Notes |
|---|---|---|---|
| M1 | Project setup and environment | ✅ Completed | Virtual env, structure, deps |
| M2 | Authentication module | ✅ Completed | JWT, RBAC, register/login |
| M3 | Dataset ingestion and storage | ✅ Completed | CSV, XLSX, XML, file store |
| M4 | Data processing pipeline | ✅ Completed | Clean, normalize, type coerce |
| M5 | Data profiling | ✅ Completed | Stats, quality, schema |
| M6 | Visualization agent | ✅ Completed | Scoring, ranking, dedup |
| M7 | Report orchestrator | ✅ Completed | Period aggregations, fallback |
| M8 | Frontend dashboard | ✅ Completed | Upload, widgets, export |
| M9 | Testing suite | ✅ Completed | pytest, unit + integration |
| M10 | Final documentation | ✅ Completed | Architecture, API, guides |

### 19.2 Key Challenges Resolved

**Challenge 1: passlib + bcrypt on Python 3.12 / Windows**  
bcrypt v5 broke passlib's bcrypt wrapper. Switched to pbkdf2_sha256. Documented in user memory to prevent recurrence.

**Challenge 2: TestClient missing DB initialization**  
FastAPI lifespan events were not triggered in tests. Resolved by explicitly calling table creation in test setup.

**Challenge 3: Visualization agent empty output**  
Datasets with no datetime or numeric columns produced zero suggestions. Added pie chart and KPI fallback rules for pure categorical datasets.

**Challenge 4: Export PDF resolution**  
jsPDF output was low quality. Fixed by passing `scale: 2` to html2canvas for high-DPI capture.

**Challenge 5: XML parsing edge cases**  
Deeply nested XML structures caused parsing failures. Added recursive normalization and explicit error surfacing.

---

## 20. Conclusion

The Agentic AI Data Visualization System successfully delivers an end-to-end automated analytics platform that addresses the core problems of data fragmentation, manual preprocessing, and slow reporting in e-commerce analytics.

The architecture is production-aware, modular, and extensible. All core functional requirements are implemented, tested, and documented. The system provides measurable value:

- Reduces time from raw data to interactive dashboard.
- Removes manual chart configuration through intelligent recommendation.
- Provides secure, role-differentiated analytics access.
- Generates exportable, shareable report artifacts.
- Maintains a complete and auditable operation history.

The project demonstrates strong alignment between academic software engineering principles and practical full-stack development, producing a platform that is ready for prototype demonstration and progressive production hardening.

---

*Final Documentation v1.0 | Agentic AI Data Visualization System | April 29, 2026*
