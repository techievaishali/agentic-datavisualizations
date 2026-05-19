from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class DatasetOut(BaseModel):
    id: int
    name: str
    source_type: str
    profile: dict
    quality: dict
    curated_path: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SQLIngestRequest(BaseModel):
    sql_connection: str
    query: str
    dataset_name: str


class ReportCreate(BaseModel):
    dataset_id: int
    period: str = "monthly"


class ReportOut(BaseModel):
    id: int
    dataset_id: int
    title: str
    period: str
    report_spec: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WidgetCreate(BaseModel):
    report_id: int
    title: str
    chart_type: str
    x_field: str | None = None
    y_field: str | None = None
    color: str = "#1f77b4"
    pattern: str = "solid"
    position: int = 0
    config: dict = Field(default_factory=dict)


class WidgetUpdate(BaseModel):
    title: str | None = None
    chart_type: str | None = None
    x_field: str | None = None
    y_field: str | None = None
    color: str | None = None
    pattern: str | None = None
    position: int | None = None
    config: dict | None = None


class WidgetOut(BaseModel):
    id: int
    report_id: int
    title: str
    chart_type: str
    x_field: str | None
    y_field: str | None
    color: str
    pattern: str
    position: int
    config: dict

    model_config = ConfigDict(from_attributes=True)


class DashboardResponse(BaseModel):
    dataset: DatasetOut
    reports: list[ReportOut]
    widgets: list[WidgetOut]


class DrilldownResponse(BaseModel):
    field: str
    value: str
    period: str | None = None
    total_count: int
    records: list[dict]


class WidgetSummaryRequest(BaseModel):
    period_data: list[dict] = []


class WidgetSummaryResponse(BaseModel):
    text: str
    mode: str
    provider: str
    model: str
    status: str


class ReportKpiRequest(BaseModel):
    period_data: list[dict] = []


class KpiCard(BaseModel):
    key: str
    label: str
    value: str


class ReportKpiResponse(BaseModel):
    cards: list[KpiCard]
    mode: str
    provider: str
    model: str
    status: str
