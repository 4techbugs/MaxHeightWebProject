import { useEffect, useState } from "react";
import { Download, Eye, Filter, Printer, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar/Navbar.jsx";
import Sidebar from "../../components/Sidebar/Sidebar.jsx";
import "./BillHistory.css";

function BillHistory() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let active = true;
    async function loadBills() {
      try {
        const response = await fetch("/api/client/bills");
        const data = await response.json();
        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (!response.ok) throw new Error(data.message || "Unable to load your bills.");
        const rows = Array.isArray(data) ? data : [];
        if (active) setBills(rows.map((row) => ({
          id: String(row.ID),
          number: row.ReceiptID || `BILL-${row.ID}`,
          flat: row.UnitNo || row.FlatID || "N/A",
          meter: row.MeterNumber || "N/A",
          date: String(row.BillDate || "").slice(0, 10),
          grid: Number(row.Unit || 0),
          gd: Number(row.DGUnit || 0),
          amount: Number(row.ChargeAmount || 0),
          status: row.Status || "Pending",
        })));
        if (active) setError("");
      } catch (loadError) {
        if (active) setError(loadError instanceof TypeError ? "The account service is offline. Please try again later." : loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBills();
    return () => { active = false; };
  }, [navigate]);

  const filtered = bills.filter((b) => {
    const matchQ = !q || String(b.number).toLowerCase().includes(q.toLowerCase()) || String(b.flat).toLowerCase().includes(q.toLowerCase()) || String(b.meter).includes(q);
    const matchS = status === "All" || b.status === status;
    const matchFrom = !from || String(b.date) >= from;
    const matchTo = !to || String(b.date) <= to;
    return matchQ && matchS && matchFrom && matchTo;
  });

  return (
    <div className="eb-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="eb-content">
        <Navbar title="Bill History" onMenu={() => setSidebarOpen(true)} />
        <div className="eb-page">
          <div className="eb-page-heading">
            <div><h1>Bill History</h1><p>View and manage all previously generated bills.</p></div>
          </div>

          <div className="eb-card">
            <div className="eb-bh-filters">
              <div className="eb-bh-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bill, flat, or meter..." /></div>
              <div className="eb-bh-filter-row">
                <div className="eb-bh-select"><Filter size={14} /><select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option><option>Paid</option><option>Pending</option><option>Overdue</option></select></div>
                <div className="eb-bh-date"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div className="eb-bh-date"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              </div>
            </div>
            <div className="eb-table-wrap">
              <table className="eb-table">
                <thead><tr><th>Bill Number</th><th>Flat</th><th>Meter</th><th>Date</th><th>Grid</th><th>GD</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={9} className="eb-empty">Loading your bills...</td></tr> : error ? <tr><td colSpan={9} className="eb-empty" role="alert">{error}</td></tr> : filtered.map((b) => (
                    <tr key={b.id}>
                      <td>{b.number}</td>
                      <td>{b.flat}</td>
                      <td>{b.meter}</td>
                      <td>{b.date}</td>
                      <td>{b.grid} kWh</td>
                      <td>{b.gd}</td>
                      <td>₹{b.amount.toLocaleString("en-IN")}</td>
                      <td><span className={`eb-status eb-status-${b.status.toLowerCase()}`}>{b.status}</span></td>
                      <td><div className="eb-bh-actions"><Link to={`/bill-details/${b.id}`} className="eb-icon-btn" title="View"><Eye size={16} /></Link><button className="eb-icon-btn" title="Print" onClick={() => window.print()}><Printer size={16} /></button><button className="eb-icon-btn" title="Download"><Download size={16} /></button></div></td>
                    </tr>
                  ))}
                  {!loading && !error && filtered.length === 0 && <tr><td colSpan={9} className="eb-empty">No bills match your filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default BillHistory;
