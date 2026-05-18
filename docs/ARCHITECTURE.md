# Agentic AI Data Visualization System - Architecture Documentation

## Executive Summary

The Agentic AI Data Visualization system is a modern, full-stack application designed to automate data ingestion, analysis, and intelligent visualization generation for e-commerce platforms. The architecture follows a layered approach with clear separation of concerns: **Client Layer → API Gateway → Business Logic Layer → Data Layer**.

---

## 1. Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                            │
│              (React 18 SPA - Web Browser)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                    FRONTEND LAYER                            │
│  (UI Components, State Management, Export Module)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              API GATEWAY & AUTHENTICATION                    │
│     (JWT Tokens, Role-Based Access Control)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              BACKEND BUSINESS LOGIC LAYER                    │
│  (FastAPI, Agents, Orchestrators, Processors)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                    DATA LAYER                                │
│  (SQLite/PostgreSQL ORM, Cache, File System)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Layer-by-Layer Architecture

### 2.1 Client Layer

**Technology:** React 18 (Single Page Application)

**Responsibilities:**
- Renders user interface in web browsers
- Handles user interactions
- Manages client-side state

**Key Features:**
- Responsive design (mobile-friendly)
- Real-time updates via API polling
- Session management via JWT tokens

---

### 2.2 Frontend Layer

**Location:** `frontend/src/`

**Core Components:**

#### A. Upload Zone (`components/UploadZone.jsx`)
- **Purpose:** File upload interface
- **Supported Formats:** CSV, Excel (.xlsx), XML
- **Features:**
  - Drag-and-drop support
  - File browser selection
  - Dataset naming (auto-filled from filename)
  - Validation before upload

#### B. Chart Components (`components/WidgetCard.jsx`)
- **Purpose:** Interactive data visualization
- **Supported Chart Types:**
  - Line Charts (time-series trends)
  - Bar Charts (categorical comparisons)
  - Scatter Plots (correlation analysis)
  - Pie Charts (composition analysis)
  - KPI Widgets (key metrics)
- **Features:**
  - Customizable colors & patterns
  - Interactive tooltips
  - Chart type selection
  - Delete functionality

#### C. Export Module
- **Purpose:** Generate PDF reports
- **Technology:** jsPDF + html2canvas
- **Capabilities:**
  - Full dashboard export
  - Selected widgets export
  - Metadata headers
  - High-quality rendering

#### D. State Management
- **Tool:** React Hooks (useState, useContext, useReducer)
- **State Variables:**
  - `datasets`: Available datasets
  - `selectedDataset`: Currently active dataset
  - `widgets`: Dashboard widgets
  - `selectedWidgetIds`: Widgets selected for export
  - `reports`: Generated reports
  - `dataQuality`: Data profiling metrics

---

### 2.3 API Gateway & Authentication Layer

**Location:** `backend/app/middleware/auth.py`

#### Authentication Mechanism
- **Type:** JWT (JSON Web Tokens)
- **Algorithm:** HS256 (HMAC SHA-256)
- **Token Placement:** `Authorization: Bearer <token>`

#### Authorization
- **Role-Based Access Control (RBAC)**
- **Roles:**
  - `admin`: Full system access
  - `analyst`: Data access & visualization creation
  - `viewer`: Read-only access

#### Security Features
- Token expiration (default: 24 hours)
- Password hashing with pbkdf2_sha256
- CORS protection
- Request validation via Pydantic

---

### 2.4 Backend Business Logic Layer

**Technology:** Python 3.12, FastAPI 0.115.5

**Location:** `backend/app/`

#### A. Upload Handler (`routers/datasets.py::upload_dataset`)

**Process:**
1. Validate file format
2. Parse file (CSV/Excel/XML)
3. Ingest data into staging area
4. Call data processor

**Output:** Dataset with metadata

---

#### B. Data Processor (`agents/data_processor.py`)

**Responsibilities:**
1. **Cleansing:**
   - Handle missing values (forward fill, drop)
   - Remove duplicates
   - Trim whitespace

2. **Type Conversion:**
   - Infer column types
   - Convert to appropriate data types
   - Handle datetime parsing

3. **Normalization:**
   - Standardize column names
   - Remove special characters
   - Ensure data consistency

**Output:** Clean, normalized dataset

---

#### C. Data Profiler (`agents/data_profiler.py`)

**Analyzes:**
- **Statistical Metrics:**
  - Mean, median, std dev, min, max
  - Distribution shape
  - Correlation matrix

- **Data Quality:**
  - Missing value percentage
  - Unique value counts
  - Data type validation

- **Schema Information:**
  - Column names & types
  - Cardinality analysis
  - Index identification

**Output:** Quality report & profiling metadata

---

#### D. Visualization Agent (`agents/visualization_agent.py`)

**Algorithm:** ML-Driven Heuristic Suggestion Engine

**Key Methods:**

1. **_pick_preferred_metric()**: Identifies numeric columns prioritizing business metrics
   - Keywords: revenue, sales, profit, amount, total, price
   - Fallback: Any numeric column

2. **_pick_preferred_category()**: Selects categorical columns for grouping
   - Cardinality check: 2-20 unique values
   - Excludes ID columns
   - Prioritizes human-readable names

3. **_add_if_unique()**: Deduplicates suggestions
   - Prevents duplicate (chart_type, x_field, y_field) combinations
   - Maintains diversity in suggestions

4. **suggest()**: Main suggestion engine
   - Generates up to 8 recommendations
   - Scores by confidence (0-100)
   - Sorts by confidence descending

**Suggestion Rules:**

| Condition | Chart Type | Scoring |
|-----------|-----------|---------|
| Datetime + Numeric | Line Chart | +40 (time-series preference) |
| Category + Numeric | Bar Chart | +30 |
| Numeric + Numeric | Scatter Plot | +25 |
| Single Category | Pie Chart | +20 (if cardinality ≤ 10) |
| Any Numeric | KPI Widget | +15 |

**Output:** Ranked list of visualization suggestions with confidence scores

---

#### E. Report Orchestrator (`agents/report_orchestrator.py`)

**Responsibilities:**

1. **Aggregation Logic:**
   - Generate time-period aggregations (daily, weekly, monthly, quarterly, yearly)
   - Support non-datetime datasets via fallback grouping
   - Handle NULL values gracefully

2. **Period Analysis:**
   - Daily aggregations (per date)
   - Weekly aggregations (per ISO week)
   - Monthly aggregations (per year-month)
   - Quarterly aggregations (per quarter)
   - Yearly aggregations (per year)

3. **Fallback Strategies:**
   - Non-datetime datasets: Group by category + aggregate
   - Missing aggregations: Return empty arrays
   - Invalid specifications: Return error details

**Output:** Complete report with aggregations for all periods

---

#### F. Report Router (`routers/reports.py`)

**Endpoints:**
- `POST /api/reports/create`: Create new report
- `GET /api/reports/{report_id}`: Retrieve report
- `PUT /api/reports/{report_id}`: Update report
- `DELETE /api/reports/{report_id}`: Delete report

---

### 2.5 Data Layer

**Technology:** SQLAlchemy 2.0 ORM with SQLite (PostgreSQL-ready)

**Location:** `backend/app/models/`

#### Database Schema

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ users        │      │ datasets     │      │ reports      │
├──────────────┤      ├──────────────┤      ├──────────────┤
│ id (PK)      │      │ id (PK)      │      │ id (PK)      │
│ username (U) │      │ user_id (FK) │      │ user_id (FK) │
│ email (U)    │      │ name         │      │ dataset_id   │
│ password_h   │      │ description  │      │ name         │
│ role         │      │ created_at   │      │ created_at   │
│ created_at   │      │ updated_at   │      │ updated_at   │
│ is_active    │  ◄────┤ file_path    │  ◄────┤ config (JSON)│
└──────────────┘      └──────────────┘      └──────────────┘
        ▲                      ▲                      ▲
        │                      │                      │
        └──────────────┬───────┴──────────────┬───────┘
                 │                           │
         ┌──────────────────────────────────┐
         │ Data relationships via           │
         │ Foreign Keys & Indexes           │
         └──────────────────────────────────┘
```

**Key Tables:**

1. **users**: User accounts, authentication
2. **datasets**: Uploaded data sources, metadata
3. **reports**: Generated reports, visualization configs
4. **widgets**: Individual chart configurations
5. **audit_logs**: System event tracking

#### Caching Strategy

- **In-Memory Cache:** Aggregated data during session
- **Purpose:** Reduce database queries
- **Invalidation:** On data update

---

## 3. Data Flow

### Upload → Processing → Visualization Flow

```
User uploads file
       ↓
   [Upload Handler]
   - Parse file
   - Validate format
       ↓
   [Data Processor]
   - Clean & normalize
   - Remove duplicates
       ↓
   [Data Profiler]
   - Generate statistics
   - Calculate quality metrics
       ↓
   [Visualization Agent]
   - Analyze data characteristics
   - Generate chart suggestions
       ↓
   [Report Orchestrator]
   - Create aggregations
   - Build period analyses
       ↓
   [Database Storage]
   - Save dataset
   - Store reports & widgets
       ↓
   [Frontend Rendering]
   - Display widgets
   - Show data quality
   - Enable customization
```

---

## 4. Technology Stack

### Backend
| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.12 | Core language |
| FastAPI | 0.115.5 | Web framework |
| SQLAlchemy | 2.0.36 | ORM |
| Pydantic | 2.10.3 | Data validation |
| pandas | 2.2.3 | Data manipulation |
| scikit-learn | 1.5.2 | ML utilities |
| passlib | Latest | Password hashing |

### Frontend
| Component | Version | Purpose |
|-----------|---------|---------|
| React | 18 | UI framework |
| Vite | 5 | Build tool |
| Recharts | 2.13 | Charting library |
| Axios | 1.7 | HTTP client |
| jsPDF | 4.2.1 | PDF generation |
| html2canvas | 1.4.1 | DOM to image |

### Database
| Component | Purpose |
|-----------|---------|
| SQLite | Development database |
| PostgreSQL | Production-ready (ORM compatible) |

---

## 5. Design Patterns

### 1. **Agent Pattern**
- Autonomous decision-making components
- `VisualizationAgent`: Intelligent chart recommendation
- `ReportOrchestrator`: Report generation coordination

### 2. **Repository Pattern**
- Abstract data access layer
- SQLAlchemy models act as repositories
- Centralized query logic

### 3. **Middleware Pattern**
- Authentication middleware intercepts requests
- Validates JWT tokens
- Enforces role-based access

### 4. **Factory Pattern**
- Widget creation from suggestions
- Chart component instantiation
- Report generation

### 5. **Observer Pattern**
- React hooks for state management
- Component re-rendering on state changes
- Event-driven updates

---

## 6. Scalability & Performance

### Current Optimization
- **Backend:**
  - Async/await for I/O operations
  - Database indexing on frequently queried columns
  - In-memory caching of aggregations

- **Frontend:**
  - Code splitting via Vite
  - Lazy component loading
  - Memoization for chart rendering

### Future Scaling Options
1. **Horizontal Scaling:**
   - Multiple FastAPI instances behind load balancer
   - Distributed cache (Redis)
   - Kubernetes orchestration

2. **Database Scaling:**
   - PostgreSQL with read replicas
   - Partitioning for large datasets
   - Connection pooling

3. **Data Processing:**
   - Celery task queue for long-running jobs
   - Spark/Dask for big data processing
   - Batch processing pipeline

---

## 7. Security Architecture

### Authentication Flow
```
1. User login (username + password)
   ↓
2. Verify credentials against password hash
   ↓
3. Generate JWT token (claims: user_id, role, exp)
   ↓
4. Return token to frontend
   ↓
5. Frontend includes token in API requests
   ↓
6. Backend validates token signature & expiration
   ↓
7. Authorize based on role
```

### Security Measures
- ✅ Password hashing with pbkdf2_sha256
- ✅ JWT token expiration (24 hours)
- ✅ CORS protection
- ✅ Input validation via Pydantic
- ✅ SQL injection prevention via ORM
- ✅ Audit logging of sensitive operations

---

## 8. Deployment Architecture

### Development Environment
```
Frontend: http://localhost:5173 (Vite dev server)
Backend: http://localhost:8000 (FastAPI dev server)
Database: SQLite (local file)
```

### Production Architecture (Recommended)
```
┌─────────────────┐
│  CDN            │ (Static assets, CSS, JS)
└────────┬────────┘
         │
┌────────┴────────────────────────────────────────┐
│ Load Balancer (nginx/HAProxy)                   │
└────────┬────────────────────────────────────────┘
         │
┌────────┴────────────────────────────────────────┐
│ Application Servers (Multiple FastAPI instances)│
│ - Container 1 (Kubernetes Pod)                  │
│ - Container 2 (Kubernetes Pod)                  │
│ - Container 3 (Kubernetes Pod)                  │
└────────┬────────────────────────────────────────┘
         │
┌────────┴────────────────────────────────────────┐
│ Services                                         │
│ - PostgreSQL Database                           │
│ - Redis Cache                                   │
│ - File Storage (S3/Cloud Storage)               │
└─────────────────────────────────────────────────┘
```

---

## 9. API Architecture

### RESTful Endpoints

**Datasets:**
- `POST /api/datasets/upload` - Upload new dataset
- `GET /api/datasets` - List datasets
- `GET /api/datasets/{id}` - Get dataset details
- `DELETE /api/datasets/{id}` - Delete dataset

**Reports:**
- `POST /api/reports/create` - Create report
- `GET /api/reports/{id}` - Get report
- `PUT /api/reports/{id}` - Update report
- `DELETE /api/reports/{id}` - Delete report

**Visualizations:**
- `GET /api/datasets/{id}/suggestions` - Get chart suggestions
- `POST /api/widgets` - Create widget
- `PUT /api/widgets/{id}` - Update widget
- `DELETE /api/widgets/{id}` - Delete widget

**Users:**
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/users/profile` - Get profile

---

## 10. Error Handling & Logging

### Error Handling Strategy
```python
try:
    # Process request
except ValidationError as e:
    # Return 400 Bad Request
except AuthenticationError as e:
    # Return 401 Unauthorized
except AuthorizationError as e:
    # Return 403 Forbidden
except ResourceNotFoundError as e:
    # Return 404 Not Found
except Exception as e:
    # Log error
    # Return 500 Internal Server Error
```

### Logging
- **Level:** INFO, WARNING, ERROR, CRITICAL
- **Destination:** Console + file logs
- **Audit Trail:** Database audit_logs table
- **Sensitive Data:** Masked in logs

---

## 11. Testing Architecture

### Backend Tests
- **Unit Tests:** Individual component functionality
- **Integration Tests:** Component interactions
- **Test Framework:** pytest
- **Coverage:** >80%

### Frontend Tests
- **Component Tests:** Individual React components
- **Integration Tests:** Full page flows
- **Test Framework:** Vitest
- **E2E Tests:** Cypress (recommended for future)

---

## 12. Deployment & DevOps

### CI/CD Pipeline
```
1. Code Commit
   ↓
2. GitHub Actions triggered
   ↓
3. Linting & Type Checking
   ↓
4. Unit Tests
   ↓
5. Build Frontend (Vite)
   ↓
6. Build Backend (Python)
   ↓
7. Run Integration Tests
   ↓
8. Push to Container Registry
   ↓
9. Deploy to Kubernetes/Cloud
```

### Configuration Management
- Environment variables for secrets
- `.env` files (development)
- Vault/SecretsManager (production)

---

## 13. Monitoring & Observability

### Metrics to Track
- API response times
- Error rates
- Database query performance
- User engagement
- Data processing duration

### Tools (Recommended)
- **Logging:** ELK Stack (Elasticsearch, Logstash, Kibana)
- **Metrics:** Prometheus + Grafana
- **Tracing:** Jaeger or Datadog
- **Alerting:** AlertManager or PagerDuty

---

## 14. Conclusion

The Agentic AI Data Visualization system is built on a **modern, scalable, and maintainable architecture** that:

✅ Separates concerns across distinct layers
✅ Implements intelligent automation via agents
✅ Provides secure authentication & authorization
✅ Ensures data quality & consistency
✅ Enables extensibility for future features
✅ Supports horizontal & vertical scaling
✅ Maintains comprehensive audit trails
✅ Follows industry best practices

This architecture is suitable for **enterprise-level e-commerce platforms** requiring automated data intelligence and intelligent visualization capabilities.

---

**Document Version:** 1.0
**Last Updated:** April 28, 2026
**Architecture Review:** Approved for Production
