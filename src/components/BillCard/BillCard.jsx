import { ArrowRight, CalendarDays, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import "./BillCard.css";

function BillCard({ bill }) {
  return <div className="eb-bill-card"><div className="eb-bill-top"><div className="eb-bill-file"><FileText size={18} /></div><span className={`eb-status eb-status-${bill.status.toLowerCase()}`}>{bill.status}</span></div><div className="eb-bill-number">{bill.number}</div><div className="eb-bill-period"><CalendarDays size={13} />{bill.date}</div><div className="eb-bill-bottom"><div><small>Total payable</small><strong>₹{bill.amount.toLocaleString("en-IN")}</strong></div><Link to={`/bill-details/${bill.id}`}><ArrowRight size={17} /></Link></div></div>;
}
export default BillCard;
