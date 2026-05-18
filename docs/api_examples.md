# API Example Requests

## Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "analyst@example.com",
  "full_name": "Analyst User",
  "password": "StrongPass123"
}
```

## Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "analyst@example.com",
  "password": "StrongPass123"
}
```

## Upload dataset

```bash
curl -X POST "http://127.0.0.1:8000/api/datasets/upload" \
  -H "Authorization: Bearer <token>" \
  -F "dataset_name=q1_sales" \
  -F "file=@sample_sales.csv"
```

## Generate dynamic report

```http
POST /api/reports/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "dataset_id": 1,
  "period": "monthly"
}
```

## Create widget

```http
POST /api/widgets
Authorization: Bearer <token>
Content-Type: application/json

{
  "report_id": 1,
  "title": "Revenue by Category",
  "chart_type": "bar",
  "x_field": "category",
  "y_field": "revenue",
  "color": "#1f77b4",
  "pattern": "solid",
  "position": 0,
  "config": {"note": "auto-generated"}
}
```
