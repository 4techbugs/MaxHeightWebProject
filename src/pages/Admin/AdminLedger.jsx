import { useEffect, useMemo, useState } from "react";
import { BookOpenText, RefreshCw, Search } from "lucide-react";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateValue = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "-";

function AdminLedger() {
  const [ledger, setLedger] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLedger = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ledger");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load ledger.");
      setLedger(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLedger(); }, []);

  const rows = useMemo(() => ledger.map((item) => {
    const billedTotal = Number(item.BilledTotal || 0);
    const latePenalty = Number(item.LatePenalty || 0);
    const paidAmount = Number(item.PaidAmount || 0);
    return { ...item, billedTotal, latePenalty, paidAmount, outstanding: billedTotal + latePenalty - paidAmount };
  }).filter((item) => {
    const text = `${item.UnitNo || ""} ${item.FlatID || ""} ${item.CustomerName || ""} ${item.MeterNumber || ""}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === "All" || String(item.LastStatus || "Pending").trim() === status);
  }), [ledger, query, status]);

  const totals = rows.reduce((sum, row) => ({ billed: sum.billed + row.billedTotal, penalty: sum.penalty + Number(row.BillPenalty || 0) + row.latePenalty, paid: sum.paid + row.paidAmount, outstanding: sum.outstanding + row.outstanding }), { billed: 0, penalty: 0, paid: 0, outstanding: 0 });

  return <div className="eb-admin-ledger">
    <div className="eb-admin-ledger-stats">
      <div className="eb-admin-stat"><BookOpenText size={19} /><small>Flats in ledger</small><strong>{rows.length}</strong><span>Filtered accounts</span></div>
      <div className="eb-admin-stat"><small>Total billed</small><strong>{money(totals.billed)}</strong><span>All generated bills</span></div>
      <div className="eb-admin-stat"><small>Total penalty</small><strong>{money(totals.penalty)}</strong><span>Bill + late payment</span></div>
      <div className="eb-admin-stat"><small>Outstanding</small><strong>{money(totals.outstanding)}</strong><span>After recorded payments</span></div>
    </div>
    <section className="eb-admin-table">
      <div className="eb-admin-table-head eb-admin-ledger-head"><div><h2>Flat-wise account ledger</h2><p>Charges, penalties, payments, and balance from live billing records.</p></div><button className="eb-admin-refresh" type="button" onClick={loadLedger} title="Refresh ledger"><RefreshCw size={17} /></button></div>
      <div className="eb-admin-ledger-filters"><div className="eb-admin-ledger-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flat, customer, or meter" /></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Pending</option><option>Paid</option><option>Overdue</option></select></div>
      {loading ? <div className="eb-admin-user-state">Loading ledger...</div> : error ? <div className="eb-admin-user-state eb-admin-user-error">{error}</div> : rows.length ? <div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table eb-admin-ledger-table"><thead><tr><th>Flat / customer</th><th>Meter</th><th>Bills</th><th>Rate charges</th><th>Other charges</th><th>Previous balance</th><th>Bill penalty</th><th>Late penalty</th><th>Discount</th><th>Bill total</th><th>Paid</th><th>Outstanding</th><th>Last bill</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.FlatID}><td><strong>{row.UnitNo}</strong><small>{row.CustomerName || "-"}</small></td><td>{row.MeterNumber || "-"}</td><td>{row.BillCount}</td><td>{money(row.RateAmount)}</td><td>{money(Number(row.ChargeAmount || 0) + Number(row.DGAmount || 0))}</td><td>{money(row.PreviousBalance)}</td><td>{money(row.BillPenalty)}</td><td>{money(row.LatePenalty)}</td><td>{money(row.Discount)}</td><td><strong>{money(row.billedTotal)}</strong></td><td>{money(row.paidAmount)}</td><td className={row.outstanding > 0 ? "eb-admin-negative" : ""}><strong>{money(row.outstanding)}</strong></td><td>{dateValue(row.LastBillDate)}</td><td><span className="eb-admin-status">{String(row.LastStatus || "Pending").trim()}</span></td></tr>)}</tbody></table></div> : <div className="eb-admin-user-state"><BookOpenText size={20} />No ledger records found.</div>}
    </section>
  </div>;
}

export default AdminLedger;
