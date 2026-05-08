import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function register(form) {
  const { data } = await api.post("/auth/register", form);
  return data;
}

export async function login(form) {
  const { data } = await api.post("/auth/login", form);
  localStorage.setItem("token", data.access_token);
  return data;
}

export async function uploadDataset(datasetName, file) {
  const body = new FormData();
  body.append("dataset_name", datasetName);
  body.append("file", file);
  const { data } = await api.post("/datasets/upload", body);
  return data;
}

export async function listDatasets() {
  const { data } = await api.get("/datasets");
  return data;
}

export async function generateReport(datasetId, period) {
  const { data } = await api.post("/reports/generate", { dataset_id: datasetId, period });
  return data;
}

export async function listReports(datasetId) {
  const { data } = await api.get("/reports", { params: { dataset_id: datasetId } });
  return data;
}

export async function createWidget(payload) {
  const { data } = await api.post("/widgets", payload);
  return data;
}

export async function listWidgets(reportId) {
  const { data } = await api.get("/widgets", { params: { report_id: reportId } });
  return data;
}

export async function updateWidget(widgetId, payload) {
  const { data } = await api.put(`/widgets/${widgetId}`, payload);
  return data;
}

export async function deleteWidget(widgetId) {
  const { data } = await api.delete(`/widgets/${widgetId}`);
  return data;
}

export async function getDashboard(datasetId) {
  const { data } = await api.get(`/dashboard/${datasetId}`);
  return data;
}
