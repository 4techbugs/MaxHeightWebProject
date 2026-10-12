import { useEffect, useState } from "react";
import { Download, FileBarChart, RefreshCw } from "lucide-react";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function AdminReports() {
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const response = await fetch(`/api/admin/reports?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load reports.");
      setReport(data);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  };

  useEffect(() => { loadReport(); }, []);

  const exportCsv = () => {
    const rows = report?.outstanding || [];
    const csv = [["Flat", "Customer", "Billed amount", "Paid amount", "Outstanding"], ...rows.map((row) => [row.UnitNo, row.CustomerName || "", row.BilledAmount, row.PaidAmount, row.Outstanding])].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `powerpay-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) return <div className="eb-admin-user-state">Loading reports...</div>;
  if (error) return <div className="eb-admin-empty"><div><RefreshCw size={25} /></div><h2>Reports unavailable</h2><p>{error}</p><button className="eb-btn eb-btn-light" type="button" onClick={loadReport}><RefreshCw size={15} />Retry</button></div>;

  const summary = report?.summary || {};
  return <div className="eb-admin-reports">
    <section className="eb-admin-table">
      <div className="eb-admin-table-head eb-admin-reports-head"><div><h2>Financial reports</h2><p>Filter billing and collection performance by date.</p></div><div className="eb-admin-bill-tools"><button className="eb-btn eb-btn-light" type="button" onClick={loadReport}><RefreshCw size={15} />Refresh</button><button className="eb-btn eb-btn-primary" type="button" onClick={exportCsv}><Download size={15} />Export CSV</button></div></div>
      <div className="eb-admin-report-filters"><label>From date<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label><label>To date<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label><button className="eb-btn eb-btn-primary" type="button" onClick={loadReport}><FileBarChart size={15} />Run report</button></div>
    </section>
    <div className="eb-admin-report-stats"><div className="eb-admin-stat"><small>Bills generated</small><strong>{summary.BillCount || 0}</strong><span>{money(summary.BilledAmount)} billed</span></div><div className="eb-admin-stat"><small>Collected</small><strong>{money(summary.CollectedAmount)}</strong><span>Active payments</span></div><div className="eb-admin-stat"><small>Total penalties</small><strong>{money(Number(summary.BillPenalty || 0) + Number(summary.LatePenalty || 0))}</strong><span>Bill + late penalty</span></div><div className="eb-admin-stat"><small>Discounts</small><strong>{money(summary.Discount)}</strong><span>Applied discounts</span></div></div>
    <section className="eb-admin-table"><div className="eb-admin-table-head"><div><h2>Month-wise billing</h2><p>Generated bills and penalties by month.</p></div></div><div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>Month</th><th>Bills</th><th>Billed amount</th><th>Bill penalty</th></tr></thead><tbody>{report?.monthly?.length ? report.monthly.map((row) => <tr key={row.Month}><td>{row.Month}</td><td>{row.BillCount}</td><td>{money(row.BilledAmount)}</td><td>{money(row.Penalty)}</td></tr>) : <tr><td colSpan="4">No monthly data found.</td></tr>}</tbody></table></div></section>
    <section className="eb-admin-table"><div className="eb-admin-table-head"><div><h2>Outstanding accounts</h2><p>Top flats with unpaid billed balance.</p></div></div><div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>Flat</th><th>Customer</th><th>Billed amount</th><th>Paid amount</th><th>Outstanding</th></tr></thead><tbody>{report?.outstanding?.length ? report.outstanding.map((row) => <tr key={row.FlatID}><td><strong>{row.UnitNo}</strong></td><td>{row.CustomerName || "-"}</td><td>{money(row.BilledAmount)}</td><td>{money(row.PaidAmount)}</td><td className="eb-admin-negative"><strong>{money(row.Outstanding)}</strong></td></tr>) : <tr><td colSpan="5">No outstanding accounts found.</td></tr>}</tbody></table></div></section>
  </div>;
}

export default AdminReports;
