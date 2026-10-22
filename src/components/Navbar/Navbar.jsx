import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import "./Navbar.css";

function Navbar({ title = "Overview", onMenu, hideSearch = false }) {
  return (
    <header className="eb-navbar">
      <div className="eb-navbar-left">
        <button className="eb-menu-btn" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
        <div className="eb-mobile-title"><span>{title}</span></div>
        {!hideSearch && <div className="eb-nav-search"><Search size={17} /><input placeholder="Search bills, payments, meters..." /></div>}
      </div>
      <div className="eb-nav-actions">
        <button className="eb-nav-icon"><Bell size={19} /><i>2</i></button>
        <div className="eb-profile">
          <div className="eb-profile-avatar">RS</div>
          <div className="eb-profile-copy"><strong>Rahul Sharma</strong><span>Consumer</span></div>
          <ChevronDown size={16} />
        </div>
      </div>
    </header>
  );
}
export default Navbar;
