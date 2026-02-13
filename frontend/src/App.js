import React, { useEffect, useState } from "react";
import "./App.css";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";

import { Line } from "react-chartjs-2";

// Register chart components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchForecast = () => {
    setLoading(true);
    fetch("http://127.0.0.1:8000/forecast")
      .then((res) => res.json())
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  // Chart data
  const chartData = {
    labels: data.map((item) => item.date),
    datasets: [
      {
        label: "Predicted Sales",
        data: data.map((item) => item.predicted_sales),
        borderColor: "#1976d2",
        backgroundColor: "rgba(25, 118, 210, 0.2)",
        tension: 0.3
      }
    ]
  };

  return (
    <div className="container">
      <h1>Inventory Forecast System</h1>
      <p className="subtitle">Next 7 Days Sales Prediction</p>

      <div className="button-container">
        <button onClick={fetchForecast} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Forecast"}
        </button>
      </div>

      {loading ? (
        <p className="loading">Loading data...</p>
      ) : (
        <>
          {/* 📈 Chart */}
          <div className="chart-box">
            <Line data={chartData} />
          </div>

          {/* 📋 Table */}
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Predicted Sales</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={index}>
                  <td>{item.date}</td>
                  <td>{item.predicted_sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default App;
