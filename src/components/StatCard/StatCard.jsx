import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import "./StatCard.css";

function StatCard({ label, value, change, note, icon: Icon, tone = "blue", down = false }) {
  return <div className="eb-stat-card"><div className={`eb-stat-icon eb-stat-icon-${tone}`}><Icon size={19} /></div><div className="eb-stat-content"><span>{label}</span><strong>{value}</strong><div><b className={down ? "eb-stat-down" : ""}>{down ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{change}</b><small>{note}</small></div></div></div>;
}
export default StatCard;
