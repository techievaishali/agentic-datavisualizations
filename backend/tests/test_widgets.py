from app.models import Widget


def test_create_widget_success(client, auth_context, sample_report):
    payload = {
        "report_id": sample_report.id,
        "title": "Revenue by Category",
        "chart_type": "bar",
        "x_field": "category",
        "y_field": "revenue",
        "color": "#1f77b4",
        "pattern": "solid",
        "position": 1,
        "config": {},
    }
    response = client.post("/api/widgets", json=payload, headers=auth_context["headers"])

    assert response.status_code == 200
    body = response.json()
    assert body["report_id"] == sample_report.id
    assert body["chart_type"] == "bar"


def test_list_widgets_returns_ordered_items(client, auth_context, sample_report, db_session):
    db_session.add_all(
        [
            Widget(
                report_id=sample_report.id,
                title="W2",
                chart_type="kpi",
                y_field="revenue",
                position=2,
                color="#1f77b4",
                pattern="solid",
                config={},
            ),
            Widget(
                report_id=sample_report.id,
                title="W1",
                chart_type="kpi",
                y_field="quantity",
                position=1,
                color="#ff7f0e",
                pattern="solid",
                config={},
            ),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/widgets?report_id={sample_report.id}", headers=auth_context["headers"])

    assert response.status_code == 200
    widgets = response.json()
    assert len(widgets) == 2
    assert widgets[0]["position"] <= widgets[1]["position"]


def test_update_widget_success(client, auth_context, sample_widget):
    response = client.put(
        f"/api/widgets/{sample_widget.id}",
        json={"title": "Updated Widget", "color": "#22c55e"},
        headers=auth_context["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Widget"
    assert body["color"] == "#22c55e"


def test_widget_summary_success(client, auth_context, sample_widget):
    response = client.post(
        f"/api/widgets/{sample_widget.id}/summary",
        json={"period_data": [{"revenue": 100.0}, {"revenue": 150.0}]},
        headers=auth_context["headers"],
    )

    assert response.status_code == 200
    body = response.json()
    assert "text" in body
    assert (
        body["status"] == "ok"
        or body["status"] == "provider not configured"
        or body["status"].startswith("llm_failed:")
    )


def test_delete_widget_success(client, auth_context, sample_widget):
    response = client.delete(f"/api/widgets/{sample_widget.id}", headers=auth_context["headers"])

    assert response.status_code == 200
    assert response.json()["message"] == "Widget deleted"

    missing = client.put(
        f"/api/widgets/{sample_widget.id}",
        json={"title": "Should Fail"},
        headers=auth_context["headers"],
    )
    assert missing.status_code == 404
