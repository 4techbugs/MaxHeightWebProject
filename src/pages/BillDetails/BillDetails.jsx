import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Phone, Printer, Zap } from "lucide-react";
import Navbar from "../../components/Navbar/Navbar.jsx";
import Sidebar from "../../components/Sidebar/Sidebar.jsx";
import "./BillDetails.css";

const numeric = (value) => Number(value || 0);
const dateLabel = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

function BillDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadBill() {
      try {
        const response = await fetch(`/api/client/bills/${encodeURIComponent(id || "")}`);
        const data = await response.json();
        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (!response.ok) throw new Error(data.message || "Unable to load this bill.");
        if (active) setBill(data);
      } catch (loadError) {
        if (active) setError(loadError instanceof TypeError ? "The account service is offline. Please try again later." : loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadBill();
    return () => { active = false; };
  }, [id, navigate]);

  const receipt = bill?.ReceiptID || (bill ? `BILL-${bill.ID}` : "");
  const rateAmount = numeric(bill?.RateAmount) || numeric(bill?.Charge);
  const dgAmount = numeric(bill?.DGAmount) || numeric(bill?.DGCharge);
  const otherAmount = numeric(bill?.OtherCharge) + numeric(bill?.MiscCharge);

  return (
    <div className="eb-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="eb-content">
        <Navbar title="Bill Details" onMenu={() => setSidebarOpen(true)} />
        <div className="eb-page">
          <div className="eb-page-heading">
            <div><h1>Bill Details</h1><p>{receipt ? `Detailed view of electricity bill ${receipt}.` : "View your electricity bill details."}</p></div>
            <div className="eb-heading-actions">
              <Link to="/bill-history" className="eb-btn eb-btn-light"><ArrowLeft size={16} />Back</Link>
              <button className="eb-btn eb-btn-light" onClick={() => window.print()} disabled={!bill}><Printer size={16} />Print Bill</button>
              <button className="eb-btn eb-btn-primary" disabled={!bill}><Download size={16} />Download Bill</button>
            </div>
          </div>

          {loading ? <div className="eb-admin-user-state">Loading bill...</div> : error ? <div className="eb-admin-user-state eb-admin-user-error" role="alert">{error}</div> : bill && <div className="eb-card eb-bd-bill">
            <div className="eb-bd-head">
              <div className="eb-bd-brand"><span className="eb-bd-mark"><Zap size={18} fill="currentColor" /></span><div><strong>PowerPay</strong><span>Electricity Bill</span></div></div>
              <div className="eb-bd-meta"><strong>{receipt}</strong><span>Issued: {dateLabel(bill.BillDate)}</span><span>Due: {dateLabel(bill.DueDate)}</span></div>
            </div>

            <div className="eb-bd-sections">
              <div className="eb-bd-section">
                <h3>Consumer Information</h3>
                <div className="eb-bd-info"><div><label>Name</label><strong>{bill.CustomerName || "-"}</strong></div><div><label>Meter Number</label><strong>{bill.MeterNumber || "-"}</strong></div><div><label>Unit Number</label><strong>{bill.UnitNo || bill.FlatID || "-"}</strong></div><div><label>Phone</label><strong><Phone size={12} /> {bill.PhoneNumber || "-"}</strong></div></div>
              </div>
              <div className="eb-bd-section">
                <h3>Consumption</h3>
                <div className="eb-bd-info"><div><label>Grid Units</label><strong>{numeric(bill.Unit)} kWh</strong></div><div><label>GD Units</label><strong>{numeric(bill.DGUnit)}</strong></div><div><label>Status</label><strong>{bill.Status || "-"}</strong></div></div>
              </div>
            </div>

            <div className="eb-bd-charges">
              <h3>Charges Breakdown</h3>
              <div className="eb-bd-charge-row"><span>Grid Charges</span><strong>₹{rateAmount.toLocaleString("en-IN")}</strong></div>
              <div className="eb-bd-charge-row"><span>GD Charges</span><strong>₹{dgAmount.toLocaleString("en-IN")}</strong></div>
              <div className="eb-bd-charge-row"><span>Fixed Charges</span><strong>₹{numeric(bill.FixedCharge).toLocaleString("en-IN")}</strong></div>
              <div className="eb-bd-charge-row"><span>Arrears</span><strong>₹{numeric(bill.PreviousBalance).toLocaleString("en-IN")}</strong></div>
              <div className="eb-bd-charge-row"><span>Interest</span><strong>₹{numeric(bill.penalty).toLocaleString("en-IN")}</strong></div>
              <div className="eb-bd-charge-row"><span>Other Charges</span><strong>₹{otherAmount.toLocaleString("en-IN")}</strong></div>
              <div className="eb-bd-charge-row"><span>Discount</span><strong>-₹{numeric(bill.Discount).toLocaleString("en-IN")}</strong></div>
              <div className="eb-bd-final"><span>Final Payable Amount</span><strong>₹{numeric(bill.ChargeAmount).toLocaleString("en-IN")}</strong></div>
            </div>

            <div className="eb-bd-foot">This is a computer-generated bill and does not require a physical signature. Please pay before the due date to avoid interest charges.</div>
          </div>}
        </div>
      </div>
    </div>
  );
}
export default BillDetails;
