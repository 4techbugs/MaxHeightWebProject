import { useEffect, useState } from "react";
import { BarChart3, CreditCard, FileText, ReceiptIndianRupee, RefreshCw, Users } from "lucide-react";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateValue = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "-";

function AdminOverview() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/overview");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load overview.");
      setOverview(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOverview(); }, []);

  if (loading) return <div className="eb-admin-user-state">Loading overview...</div>;
  if (error) return <div className="eb-admin-empty"><div><RefreshCw size={25} /></div><h2>Overview unavailable</h2><p>{error}</p><button className="eb-btn eb-btn-light" type="button" onClick={loadOverview}><RefreshCw size={15} />Retry</button></div>;

  const stats = overview?.stats || {};
  const activities = [
    ...(overview?.recentPayments || []).map((payment) => ({ type: "payment", title: "Payment received", detail: `Flat ${payment.FlatID} · ${money(payment.Amount)} · ${dateValue(payment.ReceiptDate)}`, label: "Payments" })),
    ...(overview?.recentBills || []).map((bill) => ({ type: "bill", title: "Bill generated", detail: `Flat ${bill.FlatID} · ${money(bill.ChargeAmount)} · ${dateValue(bill.BillDate)}`, label: "Bills" })),
  ].slice(0, 6);

  return <div className="eb-admin-overview">
    <div className="eb-admin-grid">
      <div className="eb-admin-stat"><Users size={19} /><small>Total clients</small><strong>{stats.totalClients || 0}</strong><span>Assigned flats</span></div>
      <div className="eb-admin-stat"><FileText size={19} /><small>Bills generated</small><strong>{stats.billsGenerated || 0}</strong><span>Live bill records</span></div>
      <div className="eb-admin-stat"><CreditCard size={19} /><small>Collected payments</small><strong>{money(stats.collectedPayments)}</strong><span>Active payment records</span></div>
      <div className="eb-admin-stat"><ReceiptIndianRupee size={19} /><small>Pending review</small><strong>{stats.pendingReview || 0}</strong><span>Pending bills</span></div>
    </div>
    <div className="eb-admin-table"><div className="eb-admin-table-head"><div><h2>Recent activity</h2><p>Latest bills and payments from the database</p></div><div className="eb-admin-overview-tools"><BarChart3 size={20} /><button className="eb-admin-refresh" type="button" onClick={loadOverview} title="Refresh overview"><RefreshCw size={17} /></button></div></div><div className="eb-admin-activity">{activities.length ? activities.map((activity, index) => <div key={`${activity.type}-${index}`}><span className={`eb-activity-dot eb-activity-${activity.type === "payment" ? "green" : "orange"}`} /><p><strong>{activity.title}</strong><small>{activity.detail}</small></p><b>{activity.label}</b></div>) : <div className="eb-admin-user-state">No recent activity found.</div>}</div></div>
  </div>;
}

export default AdminOverview;
