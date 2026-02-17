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

  // Transaction form state
  const [transactionForm, setTransactionForm] = useState({
    sku_id: "",
    sales_qty: 0,
    purchase_qty: 0,
    transaction_date: new Date().toISOString().split("T")[0],
  });
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState("");
  const [transactionError, setTransactionError] = useState("");

  // Replenishment state
  const [repSettings, setRepSettings] = useState(null);
  const [repRecommendation, setRepRecommendation] = useState(null);
  const [repLoading, setRepLoading] = useState(false);
  const [repError, setRepError] = useState("");
  const [repMessage, setRepMessage] = useState("");
  const [repForm, setRepForm] = useState({
    lead_time_days: 7,
    min_order_qty: 10,
    reorder_point: 50,
    safety_stock: 25,
    target_stock_level: 150,
  });
  // Fetch replenishment settings and recommendation
  const fetchReplenishment = useCallback(async () => {
    if (!selectedSku) return;
    setRepLoading(true);
    setRepError("");
    setRepMessage("");

    try {
      const [settingsRes, recRes] = await Promise.all([
        fetch(`${API}/replenishment-settings/${selectedSku}`),
        fetch(`${API}/replenishment-recommendation?sku_id=${selectedSku}&days=14`),
      ]);

      if (!settingsRes.ok) {
        const err = await settingsRes.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load replenishment settings");
      }
      if (!recRes.ok) {
        const err = await recRes.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load replenishment recommendation");
      }

      const settings = await settingsRes.json();
      const recommendation = await recRes.json();

      setRepSettings(settings);
      setRepRecommendation(recommendation);

      // populate form with current settings
      setRepForm((prev) => ({
        ...prev,
        lead_time_days: settings.lead_time_days || prev.lead_time_days,
        min_order_qty: settings.min_order_qty || prev.min_order_qty,
        reorder_point: settings.reorder_point || prev.reorder_point,
        safety_stock: settings.safety_stock || prev.safety_stock,
        target_stock_level: settings.target_stock_level || prev.target_stock_level,
      }));
    } catch (err) {
      setRepError(err.message || "Error fetching replenishment data");
    } finally {
      setRepLoading(false);
    }
  }, [selectedSku]);
 // Submit replenishment settings update
  const handleRepSettingsSubmit = async (e) => {
    e.preventDefault();
    setRepError("");
    setRepMessage("");

    try {
      const response = await fetch(`${API}/replenishment-settings/${selectedSku}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(repForm),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to save settings");
      }

      const result = await response.json();
      setRepMessage(result.message || "Settings saved");
      // refresh recommendation
      fetchReplenishment();
    } catch (err) {
      setRepError(err.message);
    }
  };
  // Fetch SKU list
  const fetchSkus = useCallback(() => {
    fetch(`${API}/skus`)
      .then((r) => r.json())
      .then((res) => {
        setSkus(res.skus || []);
        if (res.skus?.length && !selectedSku) {
          setSelectedSku(res.skus[0].sku_id);
          setTransactionForm((prev) => ({
            ...prev,
            sku_id: res.skus[0].sku_id,
          }));
        }
      })
      .catch(console.error);
  }, [selectedSku]);
        {/* Replenishment Panel */}
        {activeTab === "replenishment" && (
          <div className="replenishment-container">
            <div className="replenishment-box">
              <h2>Replenishment</h2>

              {repLoading && <p className="loading">Loading…</p>}
              {repError && <div className="alert alert-error">{repError}</div>}

              <div className="replenishment-columns">
                <div className="replenishment-panel">
                  <h3>Current Settings</h3>
                  {repSettings ? (
                    <div>
                      <p>Lead time (days): {repSettings.lead_time_days}</p>
                      <p>Min order qty: {repSettings.min_order_qty}</p>
                      <p>Reorder point: {repSettings.reorder_point}</p>
                      <p>Safety stock: {repSettings.safety_stock}</p>
                      <p>Target stock level: {repSettings.target_stock_level}</p>
                    </div>
                  ) : (
                    <p>No settings available.</p>
                  )}

                  <h4>Update Settings</h4>
                  <form onSubmit={handleRepSettingsSubmit} className="replenishment-form">
                    <div className="form-group">
                      <label>Lead time (days)</label>
                      <input
                        type="number"
                        min="1"
                        value={repForm.lead_time_days}
                        onChange={(e) => setRepForm((p) => ({ ...p, lead_time_days: Math.max(1, parseInt(e.target.value) || 1) }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Min order qty</label>
                      <input
                        type="number"
                        min="1"
                        value={repForm.min_order_qty}
                        onChange={(e) => setRepForm((p) => ({ ...p, min_order_qty: Math.max(1, parseInt(e.target.value) || 1) }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Reorder point</label>
                      <input
                        type="number"
                        min="0"
                        value={repForm.reorder_point}
                        onChange={(e) => setRepForm((p) => ({ ...p, reorder_point: Math.max(0, parseInt(e.target.value) || 0) }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Safety stock</label>
                      <input
                        type="number"
                        min="0"
                        value={repForm.safety_stock}
                        onChange={(e) => setRepForm((p) => ({ ...p, safety_stock: Math.max(0, parseInt(e.target.value) || 0) }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Target stock level</label>
                      <input
                        type="number"
                        min="0"
                        value={repForm.target_stock_level}
                        onChange={(e) => setRepForm((p) => ({ ...p, target_stock_level: Math.max(0, parseInt(e.target.value) || 0) }))}
                      />
                    </div>

                    {repMessage && <div className="alert alert-success">{repMessage}</div>}

                    <button type="submit" className="btn-submit">Save Settings</button>
                  </form>
                </div>

                <div className="replenishment-panel">
                  <h3>Recommendation</h3>
                  {repRecommendation ? (
                    <div>
                      <p>Reorder needed: {repRecommendation.reorder_needed ? "Yes" : "No"}</p>
                      <p>Order qty: {repRecommendation.order_quantity}</p>
                      <p>Urgency: {repRecommendation.urgency}</p>
                      <p>Projected stock at lead time: {repRecommendation.projected_stock_at_lead_time}</p>
                      <p>Demand during lead time: {repRecommendation.demand_during_lead_time}</p>
                      <p>Suggested order date: {repRecommendation.suggested_order_date}</p>
                      <p>Expected arrival: {repRecommendation.expected_arrival_date}</p>
                      <p className="replenishment-message">{repRecommendation.message}</p>
                    </div>
                  ) : (
                    <p>No recommendation available.</p>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <button className="refresh-btn" onClick={fetchReplenishment} disabled={repLoading}>
                      {repLoading ? "Loading…" : "Refresh Recommendation"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
  useEffect(() => {
    fetchSkus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          setMeta({
            current_stock: res.current_stock,
          });
        }
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selectedSku, activeTab, historyDays, forecastDays]);

  

  useEffect(() => {
    if (activeTab === "replenishment") {
      fetchReplenishment();
    } else if (activeTab !== "transaction") {
      fetchData();
    }
  }, [fetchData, activeTab, fetchReplenishment]);

  // Handle transaction form submission
  const handleTransactionSubmit = async (e) => {
    e.preventDefault();
    setTransactionError("");
    setTransactionMessage("");

    // Validation
    if (!transactionForm.sku_id) {
      setTransactionError("Please select a SKU");
      return;
    }

    if (
      transactionForm.sales_qty === 0 &&
      transactionForm.purchase_qty === 0
    ) {
      setTransactionError("Enter either sales qty or purchase qty");
      return;
    }

    setTransactionLoading(true);

    try {
      const response = await fetch(`${API}/record-transaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transactionForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to record transaction");
      }

      const result = await response.json();

      setTransactionMessage(
        `✓ Transaction recorded! Stock updated: ${result.previous_stock} → ${result.new_stock_level}`
      );

      // Reset form
      setTransactionForm({
        ...transactionForm,
        sales_qty: 0,
        purchase_qty: 0,
        transaction_date: new Date().toISOString().split("T")[0],
      });

      // Refresh SKU list to update stats, then switch to history
      fetchSkus();
      setTimeout(() => {
        setActiveTab("history");
      }, 1500);
    } catch (error) {
      setTransactionError(error.message);
    } finally {
      setTransactionLoading(false);
    }
  };

 

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
            onChange={(e) => {
              setSelectedSku(e.target.value);
              setTransactionForm((prev) => ({
                ...prev,
                sku_id: e.target.value,
              }));
            }}
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
          <button
            className={`tab ${activeTab === "replenishment" ? "active" : ""}`}
            onClick={() => setActiveTab("replenishment")}
          >
            Replenishment
          </button>
          <button
            className={`tab ${activeTab === "transaction" ? "active" : ""}`}
            onClick={() => setActiveTab("transaction")}
          >
            Record Transaction
          </button>
        </div>

        {activeTab !== "transaction" && (
          <>
            <div className="control-group">
              <label>
                {activeTab === "forecast" ? "Forecast" : "History"} Days
              </label>
              <div className="day-buttons">
                {(activeTab === "history" ? [7, 30, 90] : [7, 14, 30]).map(
                  (d) => {
                    const active =
                      activeTab === "history"
                        ? historyDays === d
                        : forecastDays === d;
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
                  }
                )}
              </div>
            </div>

            <button
              className="refresh-btn"
              onClick={fetchData}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </>
        )}
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
            className={`card status-${(meta.stock_status || "")
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
            <span className="card-value">{meta.current_stock}</span>
          </div>
        </div>
      )}

      {/* Transaction Recording Form */}
      {activeTab === "transaction" && (
        <div className="transaction-container">
          <div className="transaction-form-box">
            <h2>Record Sales / Purchase Transaction</h2>
            <p className="form-subtitle">
              Update inventory for {transactionForm.sku_id || "selected SKU"}
            </p>

            <form onSubmit={handleTransactionSubmit} className="transaction-form">
              {/* Date Input */}
              <div className="form-group">
                <label htmlFor="transaction-date">Transaction Date</label>
                <input
                  id="transaction-date"
                  type="date"
                  value={transactionForm.transaction_date}
                  onChange={(e) =>
                    setTransactionForm((prev) => ({
                      ...prev,
                      transaction_date: e.target.value,
                    }))
                  }
                  disabled={transactionLoading}
                />
              </div>

              {/* Sales Quantity */}
              <div className="form-group">
                <label htmlFor="sales-qty">Sales Quantity</label>
                <input
                  id="sales-qty"
                  type="number"
                  min="0"
                  value={transactionForm.sales_qty}
                  onChange={(e) =>
                    setTransactionForm((prev) => ({
                      ...prev,
                      sales_qty: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  disabled={transactionLoading}
                  placeholder="Units sold"
                />
              </div>

              {/* Purchase Quantity */}
              <div className="form-group">
                <label htmlFor="purchase-qty">Purchase Quantity</label>
                <input
                  id="purchase-qty"
                  type="number"
                  min="0"
                  value={transactionForm.purchase_qty}
                  onChange={(e) =>
                    setTransactionForm((prev) => ({
                      ...prev,
                      purchase_qty: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  disabled={transactionLoading}
                  placeholder="Units purchased"
                />
              </div>

              {/* Messages */}
              {transactionError && (
                <div className="alert alert-error">{transactionError}</div>
              )}
              {transactionMessage && (
                <div className="alert alert-success">{transactionMessage}</div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="btn-submit"
                disabled={transactionLoading}
              >
                {transactionLoading ? "Recording..." : "Record Transaction"}
              </button>
            </form>

            {/* Quick Stats */}
            {skuInfo && (
              <div className="transaction-stats">
                <div className="stat-item">
                  <span className="stat-label">Current Stock</span>
                  <span className="stat-value">{skuInfo.current_stock}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">SKU Name</span>
                  <span className="stat-value">{skuInfo.sku_name}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Records</span>
                  <span className="stat-value">{skuInfo.total_records}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      {activeTab !== "transaction" && (
        <>
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
        </>
      )}
    </div>
  );
}

export default App;
