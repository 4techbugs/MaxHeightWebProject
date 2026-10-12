import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BarChart3, CreditCard, FileText, Gauge, LogOut, ReceiptIndianRupee, Settings, UserRound, X, Zap } from "lucide-react";
import "./Sidebar.css";

const links = [
  { label: "Dashboard", to: "/dashboard", icon: Gauge, tone: "blue" },
  { label: "Bill History", to: "/bill-history", icon: FileText, tone: "orange" },
  { label: "Payment History", to: "/payment-history", icon: CreditCard, tone: "purple" },
];

function Sidebar({ open, onClose }) {
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const handleNav = () => onClose && onClose();
  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to log out.");
      navigate("/login");
    } catch (error) {
      setLogoutError(error instanceof TypeError ? "The account service is offline. Try logging out again." : error.message);
    } finally {
      setLoggingOut(false);
    }
  };
  return (
    <>
      {open && <div className="eb-sidebar-overlay" onClick={onClose} />}
      <aside className={`eb-sidebar ${open ? "eb-sidebar-open" : ""}`}>
        <div className="eb-sidebar-top">
          <div className="eb-brand">
            <span className="eb-brand-mark"><Zap size={20} fill="currentColor" /></span>
            <span>Power<span>Pay</span></span>
            <button className="eb-sidebar-close" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
          </div>
          <div className="eb-sidebar-label">Main menu</div>
          <nav className="eb-side-nav">
            {links.map(({ label, to, icon: Icon, tone }) => (
              <NavLink key={to} to={to} onClick={handleNav} className={({ isActive }) => `eb-side-link ${isActive ? "eb-side-link-active" : ""}`}>
                <Icon size={18} className={`eb-side-icon-${tone}`} /><span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="eb-sidebar-label eb-sidebar-label-space">Account</div>
          <NavLink to="/dashboard" onClick={handleNav} className="eb-side-link"><UserRound size={18} className="eb-side-icon-teal" /><span>My Profile</span></NavLink>
          <NavLink to="/dashboard" onClick={handleNav} className="eb-side-link"><Settings size={18} className="eb-side-icon-pink" /><span>Settings</span></NavLink>
        </div>
        <div className="eb-sidebar-bottom">
          <div className="eb-sidebar-help"><div className="eb-help-icon"><BarChart3 size={17} /></div><div><strong>Need help?</strong><span>Contact support</span></div></div>
          {logoutError && <span role="alert">{logoutError}</span>}
          <button className="eb-logout" onClick={handleLogout} disabled={loggingOut}><LogOut size={17} />{loggingOut ? "Logging out..." : "Log out"}</button>
        </div>
      </aside>
    </>
  );
}
export default Sidebar;
