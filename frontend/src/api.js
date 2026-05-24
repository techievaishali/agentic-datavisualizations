import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

let isRefreshing = false;
let failedQueue = [];
let lastActivityTime = Date.now();
const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Update last activity time on user interaction
export function updateActivityTime() {
  lastActivityTime = Date.now();
}

export function getLastActivityTime() {
  return lastActivityTime;
}

export function isUserIdle() {
  return Date.now() - lastActivityTime > IDLE_TIMEOUT;
}

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config } = error;

    if (error.response?.status === 401 && !config._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        });
      }

      config._retry = true;
      isRefreshing = true;

      try {
        // Check if user is idle
        if (isUserIdle()) {
          throw new Error("User idle - logout");
        }

        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token");

        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const { access_token } = data;
        localStorage.setItem("token", access_token);
        api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
        config.headers.Authorization = `Bearer ${access_token}`;

        processQueue(null, access_token);
        isRefreshing = false;

        return api(config);
      } catch (err) {
        processQueue(err, null);
        isRefreshing = false;
        clearAuth();
        window.location.href = "/";
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export function clearAuth() {
  localStorage.removeItem("token");
  delete api.defaults.headers.common.Authorization;
}

export async function autoRefreshTokenIfActive() {
  // Only refresh if user is NOT idle
  if (isUserIdle()) {
    clearAuth();
    return false;
  }

  const token = localStorage.getItem("token");
  if (!token) return false;

  try {
    const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { access_token } = data;
    localStorage.setItem("token", access_token);
    api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

export async function refreshToken() {
  // Only refresh if user is not idle
  if (isUserIdle()) {
    clearAuth();
    return false;
  }

  const token = localStorage.getItem("token");
  if (!token) return false;

  try {
    const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { access_token } = data;
    localStorage.setItem("token", access_token);
    api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

export async function register(form) {
  const { data } = await api.post("/auth/register", form);
  return data;
}

export async function login(form) {
  const { data } = await api.post("/auth/login", form);
  localStorage.setItem("token", data.access_token);
  api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
  return data;
}

export async function getCurrentUser() {
  const { data } = await api.get("/auth/me");
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

export async function getDatasetRecords(datasetId, params) {
  const { data } = await api.get(`/datasets/${datasetId}/records`, { params });
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

export async function getWidgetSummary(widgetId, periodData, comparisonPeriodData = []) {
  const { data } = await api.post(`/widgets/${widgetId}/summary`, {
    period_data: periodData,
    comparison_period_data: comparisonPeriodData,
  });
  return data;
}

export async function getReportKpis(reportId, periodData) {
  const { data } = await api.post(`/reports/${reportId}/kpis`, { period_data: periodData });
  return data;
}

export async function getBusinessInsights(reportId) {
  const { data } = await api.get(`/reports/${reportId}/business-insights`);
  return data;
}
