import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Landmark, Search, TrendingUp, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar/Navbar.jsx";
import Sidebar from "../../components/Sidebar/Sidebar.jsx";
import StatCard from "../../components/StatCard/StatCard.jsx";
import "./PaymentHistory.css";

function methodIcon(method) {
  if (method === "Online") return <span className="eb-ph-method-icon eb-ph-method-online"><CreditCard size={15} /></span>;
  if (method === "Cash") return <span className="eb-ph-method-icon eb-ph-method-cash"><Banknote size={15} /></span>;
  return <span className="eb-ph-method-icon eb-ph-method-bank"><Landmark size={15} /></span>;
}

function PaymentHistory() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadPayments() {
      try {
        const response = await fetch("/api/client/payments");
        const data = await response.json();
        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (!response.ok) throw new Error(data.message || "Unable to load your payments.");
        if (active) setPayments(data.map((payment) => ({
          id: `TXN-${payment.ID}`,
          bill: payment.BillNumber || "-",
          date: payment.ReceiptDate,
          amount: Number(payment.Amount || 0),
          method: payment.PaymentMode || "Other",
          status: payment.Status || "Active",
        })));
      } catch (loadError) {
        if (active) setError(loadError instanceof TypeError ? "The account service is offline. Please try again later." : loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPayments();
    return () => { active = false; };
  }, [navigate]);

  const filteredPayments = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return payments;

    return payments.filter((payment) => {
      const searchable = [
        payment.id,
        payment.bill,
        payment.date,
        payment.method,
        payment.status,
        payment.amount.toString(),
      ].join(" ").toLowerCase();

      return searchable.includes(term);
    });
  }, [query]);

  const total = payments.filter((p) => p.status.toLowerCase() === "active" || p.status.toLowerCase() === "successful").reduce((sum, p) => sum + p.amount, 0);
  const pending = payments.filter((p) => p.status.toLowerCase() === "pending").reduce((sum, p) => sum + p.amount, 0);
  const successfulCount = payments.filter((p) => p.status.toLowerCase() === "active" || p.status.toLowerCase() === "successful").length;
  return (
    <div className="eb-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="eb-content">
        <Navbar title="Payment History" onMenu={() => setSidebarOpen(true)} />
        <div className="eb-page">
          <div className="eb-page-heading">
            <div><h1>Payment History</h1><p>Track all your payment transactions and their status.</p></div>
          </div>

          <div className="eb-dash-stats">
            <StatCard label="Total Paid" value={`₹${total.toLocaleString("en-IN")}`} change={`${successfulCount} payments`} note="recorded" icon={Wallet} tone="green" />
            <StatCard label="Pending" value={`₹${pending.toLocaleString("en-IN")}`} change={`${payments.filter((p) => p.status.toLowerCase() === "pending").length} payments`} note="awaiting" icon={TrendingUp} tone="orange" />
            <StatCard label="Transactions" value={payments.length} change={`${payments.length} total`} note="all time" icon={CreditCard} tone="blue" />
            <StatCard label="Success Rate" value={`${payments.length ? Math.round(successfulCount / payments.length * 100) : 0}%`} change={`${successfulCount} paid`} note="of transactions" icon={TrendingUp} tone="purple" />
          </div>

          <div className="eb-card">
            <div className="eb-ph-toolbar">
              <label className="eb-ph-search" aria-label="Search payment records">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payment records..." />
              </label>
            </div>

            <div className="eb-table-wrap">
              <table className="eb-table">
                <thead><tr><th>Transaction ID</th><th>Bill Number</th><th>Payment Date</th><th>Amount</th><th>Payment Method</th><th>Status</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} className="eb-empty">Loading your payments...</td></tr> : error ? <tr><td colSpan={6} className="eb-empty" role="alert">{error}</td></tr> : filteredPayments.length === 0 ? (
                    <tr><td colSpan={6} className="eb-empty">No payment records match your search.</td></tr>
                  ) : filteredPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.bill}</td>
                      <td>{p.date}</td>
                      <td>₹{p.amount.toLocaleString("en-IN")}</td>
                      <td><span className="eb-ph-method">{methodIcon(p.method)}{p.method}</span></td>
                      <td><span className={`eb-status eb-status-${p.status.toLowerCase()}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default PaymentHistory;
