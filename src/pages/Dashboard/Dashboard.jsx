import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarDays, CreditCard, FileText, Gauge, IndianRupee, ReceiptIndianRupee, Wallet } from "lucide-react";
import Navbar from "../../components/Navbar/Navbar.jsx";
import Sidebar from "../../components/Sidebar/Sidebar.jsx";
import StatCard from "../../components/StatCard/StatCard.jsx";
import BillCard from "../../components/BillCard/BillCard.jsx";
import "./Dashboard.css";

const amount = (value) => Number(value || 0);
const dateLabel = (value, options = { month: "short", year: "numeric" }) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN", options);
};

function Dashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const response = await fetch("/api/client/dashboard");
        const data = await response.json();
        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (!response.ok) throw new Error(data.message || "Unable to load your account.");
        if (active) setAccount(data);
      } catch (loadError) {
        if (active) setError(loadError instanceof TypeError ? "The account service is offline. Please try again later." : loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadDashboard();
    return () => { active = false; };
  }, [navigate]);

  const bills = account?.bills || [];
  const payments = account?.payments || [];
  const currentBill = bills[0];
  const previousBill = bills[1];
  const outstanding = bills.reduce((sum, bill) => {
    const isPaid = String(bill.Status || "").trim().toLowerCase() === "paid";
    return isPaid ? sum : sum + Math.max(0, amount(bill.ChargeAmount) - amount(bill.TotalPaidAmount));
  }, 0);
  const monthlyUsage = Object.values(bills.reduce((months, bill) => {
    const date = new Date(bill.BillDate);
    if (Number.isNaN(date.getTime())) return months;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!months[key]) months[key] = { month: date.toLocaleDateString("en-IN", { month: "short" }), units: 0, timestamp: date.getTime() };
    months[key].units += amount(bill.Unit);
    return months;
  }, {})).sort((left, right) => left.timestamp - right.timestamp).slice(-7);
  const maxUsage = Math.max(1, ...monthlyUsage.map((item) => item.units));
  const averageUsage = monthlyUsage.length
    ? Math.round(monthlyUsage.reduce((sum, item) => sum + item.units, 0) / monthlyUsage.length)
    : 0;
  const lastPayment = payments[0];
  const recentBills = bills.slice(0, 3).map((bill) => ({
    id: String(bill.ID),
    number: bill.ReceiptID || `BILL-${bill.ID}`,
    date: dateLabel(bill.BillDate),
    amount: amount(bill.ChargeAmount),
    status: bill.Status || "Pending",
  }));

  return (
    <div className="eb-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="eb-content">
        <Navbar title="Dashboard" onMenu={() => setSidebarOpen(true)} />
        <div className="eb-page">
          <div className="eb-page-heading">
            <div><h1>Welcome back{account?.client?.name ? `, ${account.client.name}` : ""}</h1><p>Here's a snapshot of your electricity account and usage.</p></div>
            <div className="eb-heading-actions">
              <Link to="/bill-history" className="eb-btn eb-btn-light"><FileText size={16} />Bill History</Link>
            </div>
          </div>

          {error && <div className="eb-admin-user-state eb-admin-user-error" role="alert">{error}</div>}
          {loading ? <div className="eb-admin-user-state">Loading your account...</div> : !error && <>
            <div className="eb-dash-stats">
              <StatCard label="Meter Number" value={account?.client?.meter || "-"} change={account?.client?.unit || "Active"} note={account?.client?.unit ? "Assigned unit" : "Connected"} icon={Gauge} tone="blue" />
              <StatCard label="Current Bill" value={`₹${amount(currentBill?.ChargeAmount).toLocaleString("en-IN")}`} change={currentBill?.Status || "No bills"} note={currentBill ? dateLabel(currentBill.BillDate) : "No bill available"} icon={IndianRupee} tone="orange" />
              <StatCard label="Previous Bill" value={`₹${amount(previousBill?.ChargeAmount).toLocaleString("en-IN")}`} change={previousBill?.Status || "No previous bill"} note={previousBill ? dateLabel(previousBill.BillDate) : "No previous bill"} icon={ReceiptIndianRupee} tone="purple" />
              <StatCard label="Pending Amount" value={`₹${outstanding.toLocaleString("en-IN")}`} change={`${bills.filter((bill) => String(bill.Status || "").trim().toLowerCase() !== "paid").length} unpaid bills`} note="Outstanding balance" icon={Wallet} tone="green" />
            </div>

            <div className="eb-dash-grid">
              <div className="eb-card eb-dash-consumption">
                <div className="eb-card-header"><div><h2>Consumption Overview</h2><p>Monthly units consumed (kWh)</p></div><Link to="/bill-history" className="eb-icon-btn" aria-label="View bill history"><ArrowUpRight size={17} /></Link></div>
                <div className="eb-dash-chart">
                  {monthlyUsage.length ? monthlyUsage.map((item) => <div className="eb-dash-bar-col" key={`${item.month}-${item.timestamp}`}><div className="eb-dash-bar" style={{ height: `${Math.max(4, (item.units / maxUsage) * 100)}%` }}><span>{item.units}</span></div><small>{item.month}</small></div>) : <p>No consumption data is available yet.</p>}
                </div>
                <div className="eb-dash-chart-foot"><div><CalendarDays size={14} /><span>Last {monthlyUsage.length} months</span></div><div><strong>Avg: {averageUsage} kWh</strong></div></div>
              </div>

              <div className="eb-card eb-dash-side">
                <div className="eb-card-header"><div><h2>Last Payment</h2><p>Most recent transaction</p></div></div>
                <div className="eb-dash-payment">
                  <div className="eb-dash-payment-icon"><CreditCard size={20} /></div>
                  <div><strong>₹{amount(lastPayment?.Amount).toLocaleString("en-IN")}</strong><span>{lastPayment ? `${lastPayment.PaymentMode || "Payment"} · ${dateLabel(lastPayment.ReceiptDate, { day: "numeric", month: "short", year: "numeric" })}` : "No payment recorded"}</span></div>
                </div>
                <div className="eb-dash-meter">
                  <div><span>Current Consumption</span><strong>{amount(currentBill?.Unit)} kWh</strong></div>
                  <div className="eb-dash-meter-bar"><i style={{ width: `${maxUsage ? Math.min(100, (amount(currentBill?.Unit) / maxUsage) * 100) : 0}%` }} /></div>
                  <small>{currentBill ? `Latest bill · ${dateLabel(currentBill.BillDate)}` : "No bill available"}</small>
                </div>
                <div className="eb-dash-quick">
                  <h3>Quick Actions</h3>
                  <div className="eb-dash-quick-grid">
                    <Link to="/bill-history" className="eb-dash-quick-btn"><FileText size={17} /><span>Bill History</span></Link>
                    <Link to="/payment-history" className="eb-dash-quick-btn"><CreditCard size={17} /><span>Payment History</span></Link>
                    <Link to={currentBill ? `/bill-details/${currentBill.ID}` : "/bill-history"} className="eb-dash-quick-btn"><ReceiptIndianRupee size={17} /><span>Current Bill</span></Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="eb-card eb-dash-recent">
              <div className="eb-card-header"><div><h2>Recent Bills</h2><p>Your latest generated bills</p></div><Link to="/bill-history" className="eb-btn eb-btn-light">View all</Link></div>
              <div className="eb-dash-bills">{recentBills.length ? recentBills.map((bill) => <BillCard key={bill.id} bill={bill} />) : <p>No bills have been generated for this meter yet.</p>}</div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
export default Dashboard;
