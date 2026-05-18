# Technical Report: Literature Review, Problem Definition, and Design Overview

**Agentic AI Data Visualization System for E-Commerce Analytics**

---

| Field | Detail |
|---|---|
| Report Title | Agentic AI Data Visualization System: Literature Review, Problem Definition, and Design Overview |
| Author | [Your Full Name] |
| Institution | [Your Institution Name] |
| Course | [Course Name and Code] |
| Supervisor | [Supervisor Name] |
| Date | April 29, 2026 |
| Version | 1.0 |

---

## Abstract

This technical report presents a comprehensive review of the literature, a formal problem definition, and a design overview for the Agentic AI Data Visualization System. The system addresses a critical gap in enterprise analytics — the inability of business users to rapidly and reliably convert raw multi-format datasets into trustworthy visualizations and reports without manual data engineering effort. Drawing from key academic and industry research in data visualization, intelligent agent architectures, data quality management, and API-driven systems, the proposed platform integrates an automated agent pipeline with a modern web-based dashboard. The report documents milestones achieved during the project lifecycle and discusses design challenges encountered. The system is built on Python FastAPI, React 18, SQLAlchemy ORM, and pandas, with JWT-based authentication and modular agent components aligned to industry-standard design patterns.

**Keywords:** Agentic AI, Data Visualization, ETL Pipeline, Dashboard, FastAPI, React, Data Quality, REST API

---

## Table of Contents

1. Introduction
2. Literature Survey
3. Problem Statement
4. Design Overview
5. Documentation of Progress
6. References

---

## 1. Introduction

The exponential growth of business data has created both an opportunity and a challenge for organizations. Data-driven decision-making is now widely recognized as a competitive differentiator (Davenport & Harris, 2007). However, the ability to translate raw, heterogeneous data into actionable visual insights remains constrained by technical complexity and manual processing overhead. Business analysts frequently encounter inconsistent data quality, fragmented storage formats, and slow reporting cycles that limit timely decision-making (Dasu & Johnson, 2003).

Intelligent automation through agentic AI architectures offers a promising path to address these barriers. An agentic system uses autonomous, goal-directed components — referred to as agents — to perform complex pipelines without requiring manual intervention at each step (Russell & Norvig, 2020). When applied to data visualization workflows, such agents can handle ingestion, cleaning, profiling, recommendation, and orchestration in a coordinated and transparent manner.

This report presents the Agentic AI Data Visualization System, a full-stack platform designed to automate the journey from raw dataset upload to dashboard-ready visualization and report export. The following sections review the relevant literature, define the problem with precision, outline the proposed architecture, and document development progress to date.

---

## 2. Literature Survey

### 2.1 Data Visualization and Business Intelligence

Data visualization has been foundational to business intelligence since the pioneering work of Edward Tufte, who established core principles of clear, efficient, and truthful graphical communication of data (Tufte, 2001). Modern business intelligence platforms such as Tableau, Power BI, and Looker have operationalized these principles, but they still require manual configuration and data preparation (Stodder, 2013).

Heer and Shneiderman (2012) provide a comprehensive taxonomy of interactive visualization tools and identify key design considerations including overview-first, filter, and details-on-demand patterns. Their framework directly informs the widget-based dashboard approach adopted in this system, where users can progressively refine and explore data through selectable chart types including line, bar, scatter, pie, and KPI views.

Few (2009) argues that dashboard design must prioritize clarity and cognitive efficiency, ensuring users are not overwhelmed by irrelevant visual elements. This principle guided the export module design, ensuring that selected widget export produces focused, annotated PDF reports rather than raw screen captures.

### 2.2 Agentic AI and Autonomous Systems

The concept of an intelligent agent as a system that perceives its environment and acts autonomously to achieve goals was formally defined by Russell and Norvig (2020). Agent-based architectures have evolved from theoretical frameworks to practical software components used in complex workflows.

Wooldridge and Jennings (1995) distinguish between reactive agents, which respond directly to environmental inputs, and deliberative agents, which reason over goals and plan actions accordingly. The visualization recommendation agent in this system operates as a deliberative agent — it analyzes schema and profile metadata and reasons over a scoring model to select and rank chart suggestions.

More recently, the emergence of large language model-driven agentic systems such as AutoGPT and LangChain agents has renewed interest in agent pipelines (Yao et al., 2023). While this project does not use language model agents, its modular pipeline architecture shares structural similarities with these frameworks — specifically the chained, goal-directed agent handoff pattern in which each agent receives the output of the preceding step.

Wang et al. (2024) survey AI agent frameworks and identify key capabilities required for robust agentic pipelines: autonomy, perception, reasoning, and action. The present system covers all four properties within its processing modules: the upload module perceives input data, the processor and profiler reason over quality, and the visualization and orchestration agents act on those insights.

### 2.3 Data Quality and Preprocessing

Batini et al. (2009) offer a comprehensive framework for data quality management, identifying dimensions such as completeness, consistency, accuracy, and timeliness. Their work directly motivates the data profiler module, which computes quality metrics including missingness ratio, type consistency, and cardinality, to expose these dimensions to users before visualization.

Dasu and Johnson (2003) describe the concept of data exploration at scale and emphasize the importance of automated profiling tools that can handle mixed types and summarize distributions efficiently. Their recommendations align with the profiler's use of pandas-based descriptive statistics generation and column-type inference.

The principles of data wrangling and normalization described by Kandel et al. (2011) are directly implemented in the data processor module, which handles whitespace trimming, duplicate removal, forward fill of null values, and column naming normalization. Kandel et al. demonstrated through user studies that such preprocessing tasks represent approximately 80% of analyst time, making automation high-value.

### 2.4 REST API Design and FastAPI

Fielding (2000) introduced Representational State Transfer (REST) as an architectural style for distributed hypermedia systems, establishing the principles of statelessness, resource orientation, and uniform interface that underpin modern web APIs. The system's API layer follows REST conventions across all endpoints, organized by domain resource (datasets, reports, widgets, users).

FastAPI, introduced by Ramírez (2018) and maintained as an open-source project, has gained rapid adoption due to its high performance, automatic schema validation through Pydantic, and built-in OpenAPI documentation generation (Ramírez, 2018). Pydantic's data model approach, described in detail in the FastAPI documentation, enables strict type enforcement at runtime while maintaining developer ergonomics — a critical feature in this system's request validation layer.

### 2.5 Authentication and Authorization in Web Systems

Hardt (2012) defined the OAuth 2.0 authorization framework, establishing the industry standard for token-based delegated access. JSON Web Tokens (JWT), standardized as RFC 7519 by Jones et al. (2015), provide a compact, self-contained mechanism for secure information transmission and are widely used in API authentication. In this system, JWT with HMAC SHA-256 signing is used to issue and validate access tokens, enabling stateless, scalable session management.

Role-Based Access Control (RBAC) was formalized by Sandhu et al. (1996) as a model in which permissions are assigned to roles and users are assigned to roles. This model provides a balance between administrative flexibility and security granularity. The system implements three roles — admin, analyst, and viewer — aligned with common enterprise analytics access patterns.

### 2.6 React and Frontend Engineering for Dashboards

The React component model, introduced by Facebook (now Meta) engineering teams (Abramov & Clark, 2015), enables composable, state-driven user interfaces. React Hooks, introduced in React 16.8, allow functional components to manage state and lifecycle effects without class hierarchies, leading to more maintainable and testable code (Dodds, 2019).

Recharts, built on top of D3.js primitives and React's component model, provides a declarative charting library optimized for responsiveness and interactivity (Recharts Contributors, 2024). Its use in this system allows seamless rendering of line, bar, scatter, pie, and KPI chart types within the widget architecture.

The jsPDF library combined with html2canvas enables client-side PDF generation from rendered DOM elements (Strahl, 2024), allowing high-fidelity report export without requiring server-side rendering infrastructure.

### 2.7 Scalable Architecture Patterns

Newman (2015) introduced the concept of microservices as an evolution of service-oriented architecture, emphasizing small, focused, independently deployable services. While this project is not fully microservices-based, its modular agent design follows the same principle of bounded contexts — each module has a single clear responsibility and communicates through well-defined interfaces.

Evans (2003) introduced Domain-Driven Design (DDD) and the Repository Pattern, which abstracts data persistence behind domain-focused interfaces. The system applies this via SQLAlchemy ORM models, which serve as repositories for each entity domain.

Kleppmann (2017) discusses data systems design at scale, including caching patterns, event sourcing, and streaming. While the current system operates on batch upload semantics, the architecture is designed to accommodate an event-driven upgrade path by keeping processing agents modular and decoupled.

---

## 3. Problem Statement

### 3.1 Background

Organizations operating in e-commerce and data-intensive industries face increasing pressure to derive timely insights from large, heterogeneous datasets. Sales, inventory, customer, and financial data are typically collected from multiple systems in varying formats — CSV exports, Excel spreadsheets, and XML feeds — and require significant manual effort before they can be visualized or reported on (Kandel et al., 2011).

### 3.2 Identified Gaps

Three core gaps motivate this project:

**Gap 1: Format Fragmentation and Ingestion Friction**
Business data arrives in multiple, structurally inconsistent formats. Analysts must manually convert, clean, and import data before analytical tools can use it. This creates delays and introduces human error.

**Gap 2: Inconsistent Data Quality**
Raw data frequently contains missing values, duplicated records, inconsistent column types, and naming irregularities. Without automated profiling and cleansing, visualizations built on uncleaned data produce misleading insights (Batini et al., 2009).

**Gap 3: Slow and Manual Reporting**
Visualization selection, chart configuration, and report generation are currently manual, repetitive, and dependent on analyst expertise. This creates a bottleneck and limits the frequency and quality of data-driven decisions.

### 3.3 Formal Problem Statement

There is a lack of an integrated, automated system that can:
1. Accept business datasets in common formats without manual transformation.
2. Automatically ensure data quality through cleaning, normalization, and profiling.
3. Intelligently recommend appropriate visualizations based on dataset characteristics.
4. Enable non-technical users to generate, configure, and export reports and dashboards securely.
5. Maintain multi-user, role-differentiated access with full audit traceability.

The absence of such a system results in increased analyst workload, delayed decision cycles, reduced confidence in analytical outputs, and security risks from uncontrolled data access.

### 3.4 Research Questions

This project addresses the following questions:

1. How can a modular agent pipeline automate data ingestion, cleaning, profiling, and visualization recommendation end-to-end?
2. How can a heuristic scoring engine reliably recommend suitable chart types from dataset schema and quality metadata?
3. How can role-based authorization and audit logging ensure secure, accountable multi-user analytics access?

### 3.5 Hypothesis

A layered, agent-driven architecture combining automated preprocessing, intelligent visualization recommendation, and a secure API gateway will significantly reduce the time and effort required for a business user to produce reliable visual analytics from a raw dataset.

---

## 4. Design Overview

### 4.1 Architectural Philosophy

The system follows a five-layer architecture that cleanly separates client interaction, frontend rendering, API and security control, backend intelligence, and data persistence. This layered approach is aligned with the principles described by Clements et al. (2010) in software architecture documentation, ensuring clear boundaries, independent evolution, and testability.

**Figure 1: High-Level System Architecture**

```
┌────────────────────────────────────────┐
│            CLIENT LAYER                │
│  (React 18 SPA, Browser)               │
└────────────────┬───────────────────────┘
                 │ HTTPS
┌────────────────┴───────────────────────┐
│           FRONTEND LAYER               │
│  Upload · Dashboard · Export · State   │
└────────────────┬───────────────────────┘
                 │ HTTPS/JSON
┌────────────────┴───────────────────────┐
│     API GATEWAY & AUTHENTICATION       │
│  FastAPI · JWT · RBAC · Validation     │
└────────────────┬───────────────────────┘
                 │ Internal
┌────────────────┴───────────────────────┐
│     BACKEND BUSINESS LOGIC LAYER       │
│  Upload Handler · Processor · Profiler │
│  Visualization Agent · Orchestrator    │
└────────────────┬───────────────────────┘
                 │ SQL / Cache / File I/O
┌────────────────┴───────────────────────┐
│            DATA LAYER                  │
│  SQLite/PostgreSQL · Cache · Files     │
└────────────────────────────────────────┘
```

### 4.2 Layer-by-Layer Summary

**Client Layer**
The browser-based single-page application provides the entry point for Admin, Analyst, and Viewer roles. React 18 state management ensures responsive and consistent user experience across all actions.

**Frontend Layer**
Four primary frontend components handle the end-user workflow:
1. Upload Zone: supports CSV, XLSX, and XML formats with drag-and-drop and inline validation.
2. Widget Dashboard: renders interactive chart and KPI components using Recharts.
3. Export Module: uses jsPDF and html2canvas for client-side PDF report generation.
4. State Management: React hooks manage the session state for datasets, widgets, reports, and data quality summaries.

**API and Security Layer**
The FastAPI gateway exposes a RESTful API organized into resource domains: auth, datasets, reports, widgets, and users. JWT tokens carry identity and role claims. Role-Based Access Control restricts operations to authorized roles. Pydantic enforces request schema validation, reducing invalid and potentially unsafe inputs.

**Backend Intelligence Layer**
This layer implements the core agent pipeline:
1. Upload Handler validates and parses uploaded files.
2. Data Processor normalizes, deduplicates, and type-coerces records.
3. Data Profiler computes statistical summaries and quality metrics.
4. Visualization Agent scores and ranks chart type recommendations using a heuristic confidence engine.
5. Report Orchestrator builds time-period aggregations across daily, weekly, monthly, quarterly, and yearly granularities.
6. Audit Logger records security-relevant operations.

**Data Layer**
SQLAlchemy ORM manages persistence across five primary entities: users, datasets, reports, widgets, and audit_logs. An in-memory cache reduces database query load for repeated aggregations. A file store maintains raw and curated dataset files.

### 4.3 Agent Intelligence Design

The Visualization Agent implements a heuristic scoring model as summarized in Table 1.

**Table 1: Visualization Agent Heuristic Scoring Rules**

| Data Condition | Recommended Chart Type | Confidence Score |
|---|---|---|
| Datetime column + Numeric column | Line Chart | +40 |
| Category column + Numeric column | Bar Chart | +30 |
| Numeric column + Numeric column | Scatter Plot | +25 |
| Single category column (cardinality ≤ 10) | Pie Chart | +20 |
| Any numeric column | KPI Widget | +15 |

*Note: Scores are cumulative across applicable conditions. Suggestions are deduplicated and ranked descending by final confidence.*

This scoring model is directly traceable to the literature: the preference for line charts in time-series contexts follows Heer and Shneiderman's (2012) recommendation that temporal data should use position along a common scale. The bar chart preference for categorical comparisons follows Few's (2009) principle that categorical comparisons are most clearly rendered as length-encoded bars.

### 4.4 Security Architecture

Security is embedded across all layers as shown in Figure 2.

**Figure 2: Authentication and Authorization Flow**

```
User Login Request
      ↓
Credential Verification (pbkdf2_sha256 hash comparison)
      ↓
JWT Token Generation (HS256, 24-hour expiry)
      ↓
Token Returned to Frontend
      ↓
Frontend Sends Bearer Token in Request Headers
      ↓
Backend Validates Token Signature and Expiry
      ↓
RBAC Checks: Role Policy Enforced per Endpoint
      ↓
Request Processed or Denied
```

### 4.5 Data Flow Summary

The end-to-end data flow from raw upload to rendered dashboard is summarized in Table 2.

**Table 2: End-to-End Data Flow with Module Responsibility**

| Step | Module | Input | Output |
|---|---|---|---|
| 1 | Upload Handler | Raw file | Parsed dataset object |
| 2 | Data Processor | Parsed records | Curated clean dataset |
| 3 | Data Profiler | Curated dataset | Quality report, profile metadata |
| 4 | Visualization Agent | Profile metadata, schema | Ranked chart suggestions |
| 5 | Report Orchestrator | Metrics, dims, config | Period aggregation payloads |
| 6 | Persistence Layer | All entities | Stored datasets/reports/widgets |
| 7 | Frontend | API responses | Rendered widgets, dashboard |
| 8 | Export Module | Dashboard state | Downloadable PDF |

### 4.6 Connection Between Architecture and Problem

Each architectural decision directly maps to an identified problem gap:

**Table 3: Problem-to-Architecture Traceability**

| Identified Gap | Architectural Response |
|---|---|
| Format fragmentation | Multi-format parser in upload handler |
| Inconsistent data quality | Data processor and profiler agents |
| Slow manual visualization | Heuristic recommendation agent |
| Slow manual reporting | Report orchestrator with aggregation logic |
| Uncontrolled access | JWT + RBAC layer |
| Lack of traceability | Audit logger and persistence layer |

---

## 5. Documentation of Progress

### 5.1 Milestones Achieved

**Table 4: Project Milestones and Completion Status**

| Milestone | Description | Status |
|---|---|---|
| M1: Project Setup | Repository structure, virtual environment, dependency configuration | Completed |
| M2: Authentication Module | JWT login, registration, token validation, RBAC implementation | Completed |
| M3: Dataset Ingestion | Multi-format upload handler, validation logic, file storage | Completed |
| M4: Data Processing Pipeline | Cleaning, normalization, type conversion agents | Completed |
| M5: Data Profiling | Statistical summary, quality metrics, schema analysis | Completed |
| M6: Visualization Agent | Heuristic scoring model, chart ranking, deduplication | Completed |
| M7: Report Orchestrator | Period aggregations, fallback grouping, report CRUD | Completed |
| M8: Frontend Dashboard | Upload UI, widget cards, state management, export module | Completed |
| M9: Testing Suite | Backend unit and integration tests, pytest configuration | Completed |
| M10: Documentation | Architecture documentation, API examples, implementation guide | Completed |

### 5.2 Challenges Faced

**Challenge 1: Password Hashing Compatibility on Windows with Python 3.12**
During development on Windows using Python 3.12, the bcrypt backend for passlib produced runtime failures. This was traced to a known incompatibility between bcrypt version 5 and passlib's bcrypt hashing wrapper. The issue was resolved by switching the hashing algorithm to pbkdf2_sha256, which provides equivalent security for password storage and operates reliably across all target environments.

*Lesson learned:* Dependency version pinning and platform-specific testing are essential for cryptographic components.

**Challenge 2: Database Initialization in Test Environment**
FastAPI's lifespan startup event, which initializes database tables, was not consistently triggered when using TestClient in pytest. This caused test failures due to missing tables. The issue was resolved by explicitly calling the database table creation function within the test setup to ensure the test database is always initialized before test execution.

*Lesson learned:* Test environments should not depend on application lifecycle hooks. Infrastructure setup should be explicit and isolated in test configurations.

**Challenge 3: Multi-Format File Parsing Edge Cases**
Parsing XML datasets with deeply nested structures and parsing XLSX files with merged cells or multi-row headers required additional preprocessing logic. Implementing robust fallback strategies for non-standard structures increased the complexity of the upload handler.

*Lesson learned:* Data ingestion from real-world sources requires defensive parsing logic and explicit test coverage for edge cases.

**Challenge 4: Visualization Agent Coverage for Non-Standard Datasets**
Early versions of the visualization recommendation agent failed to produce any suggestions for datasets that had only categorical columns with no numeric or datetime fields. This was resolved by introducing fallback scoring rules and explicitly handling low-cardinality categorical datasets with pie chart and frequency KPI suggestions.

*Lesson learned:* AI recommendation engines require robust fallback strategies to avoid empty or unhelpful output.

**Challenge 5: Export Rendering Fidelity**
Initial attempts at PDF export using html2canvas produced low-resolution outputs for dashboards with many widgets. This was resolved by tuning the scale factor in html2canvas to capture at a higher pixel density before writing to jsPDF.

*Lesson learned:* Client-side rendering pipelines for export require careful configuration for production-quality output.

### 5.3 Current System State

The system is functionally complete for all core use cases described in the functional requirements. All backend modules are implemented, tested, and documented. The frontend supports the full upload-to-export workflow. The database schema is stable and supports all required entity relationships. The system is deployed in development configuration and is ready for demonstration.

### 5.4 Upcoming Work

1. Expanded integration and edge-case test coverage.
2. Production deployment configuration with PostgreSQL and Redis.
3. Observability integration for logging, metrics, and tracing.
4. Potential enhancement of recommendation intelligence with learned models.

---

## References

Abramov, D., & Clark, A. (2015). *React documentation: Thinking in React*. Meta Open Source. https://reactjs.org/docs/thinking-in-react.html

Batini, C., Cappiello, C., Francalanci, C., & Maurino, A. (2009). Methodologies for data quality assessment and improvement. *ACM Computing Surveys, 41*(3), 1–52. https://doi.org/10.1145/1541880.1541883

Clements, P., Bachmann, F., Bass, L., Garlan, D., Ivers, J., Little, R., Nord, R., & Stafford, J. (2010). *Documenting software architectures: Views and beyond* (2nd ed.). Addison-Wesley.

Davenport, T. H., & Harris, J. G. (2007). *Competing on analytics: The new science of winning*. Harvard Business School Press.

Dasu, T., & Johnson, T. (2003). *Exploratory data mining and data cleaning*. Wiley. https://doi.org/10.1002/0471448354

Dodds, K. (2019). *React hooks documentation*. Kent C. Dodds Blog. https://kentcdodds.com/blog/react-hooks

Evans, E. (2003). *Domain-driven design: Tackling complexity in the heart of software*. Addison-Wesley.

Few, S. (2009). *Now you see it: Simple visualization techniques for quantitative analysis*. Analytics Press.

Fielding, R. T. (2000). *Architectural styles and the design of network-based software architectures* [Doctoral dissertation, University of California Irvine]. https://ics.uci.edu/~fielding/pubs/dissertation/top.htm

Hardt, D. (Ed.). (2012). *The OAuth 2.0 authorization framework* (RFC 6749). Internet Engineering Task Force. https://datatracker.ietf.org/doc/html/rfc6749

Heer, J., & Shneiderman, B. (2012). Interactive dynamics for visual analysis. *ACM Queue, 10*(2), 30–55. https://doi.org/10.1145/2133416.2146416

Jones, M., Bradley, J., & Sakimura, N. (2015). *JSON Web Token (JWT)* (RFC 7519). Internet Engineering Task Force. https://datatracker.ietf.org/doc/html/rfc7519

Kandel, S., Paepcke, A., Hellerstein, J., & Heer, J. (2011). Wrangler: Interactive visual specification of data transformation scripts. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems*, 3363–3372. https://doi.org/10.1145/1978942.1979444

Kleppmann, M. (2017). *Designing data-intensive applications: The big ideas behind reliable, scalable, and maintainable systems*. O'Reilly Media.

Newman, S. (2015). *Building microservices: Designing fine-grained systems*. O'Reilly Media.

Ramírez, S. (2018). *FastAPI documentation*. Tiangolo. https://fastapi.tiangolo.com

Recharts Contributors. (2024). *Recharts: A composable charting library built on React components*. https://recharts.org

Russell, S., & Norvig, P. (2020). *Artificial intelligence: A modern approach* (4th ed.). Pearson.

Sandhu, R. S., Coyne, E. J., Feinstein, H. L., & Youman, C. E. (1996). Role-based access control models. *IEEE Computer, 29*(2), 38–47. https://doi.org/10.1109/2.485845

Stodder, D. (2013). *Visual analytics for making smarter decisions faster*. TDWI Research. https://tdwi.org/research/2013/08/visual-analytics-for-smarter-decisions.aspx

Strahl, R. (2024). *html2canvas and jsPDF integration guide*. West Wind Technologies. https://weblog.west-wind.com

Tufte, E. R. (2001). *The visual display of quantitative information* (2nd ed.). Graphics Press.

Wang, L., Ma, C., Feng, X., Zhang, Z., Yang, H., Zhang, J., Chen, Z., Tang, J., Chen, X., Lin, Y., Zhao, W. X., Wei, Z., & Wen, J. (2024). A survey on large language model based autonomous agents. *Frontiers of Computer Science, 18*(6), 186345. https://doi.org/10.1007/s11704-024-40231-1

Wooldridge, M., & Jennings, N. R. (1995). Intelligent agents: Theory and practice. *The Knowledge Engineering Review, 10*(2), 115–152. https://doi.org/10.1017/S0269888900008122

Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2023). ReAct: Synergizing reasoning and acting in language models. *Proceedings of the International Conference on Learning Representations (ICLR 2023)*. https://arxiv.org/abs/2210.03629

---

*Report Version 1.0 | April 29, 2026 | Agentic AI Data Visualization System*
