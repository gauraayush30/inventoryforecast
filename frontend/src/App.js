import React, { useEffect, useState, useCallback } from "react";
import "./App.css";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const API = "http://127.0.0.1:8000";

function App() {
  const [skus, setSkus] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [activeTab, setActiveTab] = useState("forecast");
  const [historyDays, setHistoryDays] = useState(7);
  const [forecastDays, setForecastDays] = useState(7);
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch SKU list once
  useEffect(() => {
    fetch(`${API}/skus`)
      .then((r) => r.json())
      .then((res) => {
        setSkus(res.skus || []);
        if (res.skus?.length) setSelectedSku(res.skus[0].sku_id);
      })
      .catch(console.error);
  }, []);

  // Fetch history or forecast whenever controls change
  const fetchData = useCallback(() => {
    if (!selectedSku) return;
    setLoading(true);

    const url =
      activeTab === "forecast"
        ? `${API}/forecast?sku_id=${selectedSku}&days=${forecastDays}`
        : `${API}/history?sku_id=${selectedSku}&days=${historyDays}`;

    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (activeTab === "forecast") {
          setData(res.forecast || []);
          setMeta({
            current_stock: res.current_stock,
            total_forecast_demand: res.total_forecast_demand,
            stock_status: res.stock_status,
          });
        } else {
          setData(res.history || []);
          setMeta(null);
        }
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selectedSku, activeTab, historyDays, forecastDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── chart config ───────────────────────────────────────────
  const chartData =
    activeTab === "forecast"
      ? {
        labels: data.map((d) => d.date),
        datasets: [
          {
            label: "Predicted Sales",
            data: data.map((d) => d.predicted_sales),
            borderColor: "#1976d2",
            backgroundColor: "rgba(25,118,210,0.12)",
            tension: 0.35,
            fill: true,
            pointRadius: 4,
          },
        ],
      }
      : {
        labels: data.map((d) => d.date),
        datasets: [
          {
            label: "Sales Qty",
            data: data.map((d) => d.sales_qty),
            borderColor: "#2e7d32",
            backgroundColor: "rgba(46,125,50,0.12)",
            tension: 0.35,
            fill: true,
            pointRadius: 3,
          },
          {
            label: "Stock Level",
            data: data.map((d) => d.stock_level),
            borderColor: "#f57c00",
            backgroundColor: "rgba(245,124,0,0.08)",
            tension: 0.35,
            fill: false,
            pointRadius: 3,
            borderDash: [6, 3],
          },
        ],
      };

  const chartOpts = {
    responsive: true,
    plugins: { legend: { position: "top" } },
    scales: { y: { beginAtZero: true } },
  };

  const skuInfo = skus.find((s) => s.sku_id === selectedSku);

  // ── render ─────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>Inventory Forecast System</h1>
        <p className="subtitle">Multi-SKU Sales Prediction &amp; Analytics</p>
      </header>

      {/* Controls */}
      <div className="controls">
        <div className="control-group">
          <label htmlFor="sku-select">SKU</label>
          <select
            id="sku-select"
            value={selectedSku}
            onChange={(e) => setSelectedSku(e.target.value)}
          >
            {skus.map((s) => (
              <option key={s.sku_id} value={s.sku_id}>
                {s.sku_id} — {s.sku_name}
              </option>
            ))}
          </select>
        </div>

        <div className="tab-group">
          <button
            className={`tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            History
          </button>
          <button
            className={`tab ${activeTab === "forecast" ? "active" : ""}`}
            onClick={() => setActiveTab("forecast")}
          >
            Forecast
          </button>
        </div>

        <div className="control-group">
          <label>{activeTab === "forecast" ? "Forecast" : "History"} Days</label>
          <div className="day-buttons">
            {(activeTab === "history" ? [7, 30, 90] : [7, 14, 30]).map((d) => {
              const active =
                activeTab === "history" ? historyDays === d : forecastDays === d;
              return (
                <button
                  key={d}
                  className={`day-btn ${active ? "active" : ""}`}
                  onClick={() =>
                    activeTab === "history"
                      ? setHistoryDays(d)
                      : setForecastDays(d)
                  }
                >
                  {d}d
                </button>
              );
            })}
          </div>
        </div>

        <button
          className="refresh-btn"
          onClick={fetchData}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Stock status cards (forecast only) */}
      {meta && activeTab === "forecast" && (
        <div className="status-cards">
          <div className="card">
            <span className="card-label">Current Stock</span>
            <span className="card-value">{meta.current_stock}</span>
          </div>
          <div className="card">
            <span className="card-label">Forecast Demand</span>
            <span className="card-value">{meta.total_forecast_demand}</span>
          </div>
          <div
            className={`card status-${meta.stock_status
              .replace(/\s+/g, "-")
              .toLowerCase()}`}
          >
            <span className="card-label">Status</span>
            <span className="card-value">{meta.stock_status}</span>
          </div>
        </div>
      )}

      {/* SKU info bar (history only) */}
      {skuInfo && activeTab === "history" && (
        <div className="status-cards">
          <div className="card">
            <span className="card-label">SKU</span>
            <span className="card-value">{skuInfo.sku_name}</span>
          </div>
          <div className="card">
            <span className="card-label">Records</span>
            <span className="card-value">{skuInfo.total_records}</span>
          </div>
          <div className="card">
            <span className="card-label">Current Stock</span>
            <span className="card-value">{skuInfo.current_stock}</span>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <p className="loading">Loading data…</p>
      ) : data.length === 0 ? (
        <p className="no-data">No data available.</p>
      ) : (
        <>
          <div className="chart-box">
            <Line data={chartData} options={chartOpts} />
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {activeTab === "forecast" ? (
                    <th>Predicted Sales</th>
                  ) : (
                    <>
                      <th>Sales Qty</th>
                      <th>Purchase Qty</th>
                      <th>Stock Level</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr key={i}>
                    <td>{item.date}</td>
                    {activeTab === "forecast" ? (
                      <td>{item.predicted_sales}</td>
                    ) : (
                      <>
                        <td>{item.sales_qty}</td>
                        <td>{item.purchase_qty}</td>
                        <td>{item.stock_level}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
