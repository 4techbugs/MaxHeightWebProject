import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookOpenText, Building2, CreditCard, FilePenLine, FileText, Gauge, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Users, X, FilePlus2, List } from "lucide-react";
import Navbar from "../../components/Navbar/Navbar.jsx";
import AdminGenerateBill from "./AdminGenerateBill.jsx";
import AdminUsers from "./AdminUsers.jsx";
import AdminBills from "./AdminBills.jsx";
import AdminPayments from "./AdminPayments.jsx";
import AdminChargeMasters from "./AdminChargeMasters.jsx";
import AdminLedger from "./AdminLedger.jsx";
import AdminOverview from "./AdminOverview.jsx";
import AdminReports from "./AdminReports.jsx";
import AdminEditBill from "./AdminEditBill.jsx";
import AdminFlatMaster from "./AdminFlatMaster.jsx";
import "./AdminDashboard.css";

const tabs = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard },
  { label: "Users", to: "/admin/users", icon: Users },
  { label: "Flat Master", to: "/admin/flat-master", icon: Building2 },
   { label: "Generate Bill", to: "/admin/generate-bill", icon: FilePlus2 },
   { label: "Edit Bills", to: "/admin/edit-bills", icon: FilePenLine },
  { label: "Bills", to: "/admin/bills", icon: FileText },
  { label: "Payments", to: "/admin/payments", icon: CreditCard },
  { label: "Payment List", to: "/admin/payment-list", icon: List },
  { label: "Ledger", to: "/admin/ledger", icon: BookOpenText },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

const content = {
  "/admin": { title: "Admin overview", description: "Monitor electricity billing operations across the platform." },
  "/admin/users": { title: "User management", description: "Manage client accounts, meters, and account status." },
  "/admin/flat-master": { title: "Flat master", description: "View assigned flats with customer, type, floor, amount, and status details." },
  "/admin/bills": { title: "Bill management", description: "Review generated bills and billing activity." },
  "/admin/edit-bills": { title: "Edit bills", description: "Select a flat, review monthly bills, and save corrections." },
  "/admin/generate-bill": { title: "Generate bill", description: "Create and save electricity bills for client meters." },
  "/admin/payments": { title: "Payment management", description: "Track collections, pending payments, and transactions." },
  "/admin/payment-list": { title: "Payment list", description: "View active payment records and receipts." },
  "/admin/ledger": { title: "Flat ledger", description: "Review billed charges, penalties, payments, and outstanding balances by flat." },
  "/admin/reports": { title: "Reports", description: "Review operational and financial performance." },
  "/admin/settings": { title: "Admin settings", description: "Configure workspace access and system preferences." },
};

function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const activeContent = content[location.pathname] || content["/admin"];

  return (
    <div className="eb-admin-shell">
      {open && <div className="eb-admin-overlay" onClick={() => setOpen(false)} />}
      <aside className={`eb-admin-sidebar ${open ? "eb-admin-sidebar-open" : ""}`}>
        <div>
          <div className="eb-admin-brand"><span><ShieldCheck size={19} /></span><strong>Power<span>Pay</span></strong><button onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
          <div className="eb-admin-role"><ShieldCheck size={15} /><span>Administrator workspace</span></div>
          <div className="eb-admin-label">Admin panel</div>
          <nav className="eb-admin-nav">{tabs.map(({ label, to, icon: Icon }) => <NavLink end={to === "/admin"} key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "eb-admin-link eb-admin-link-active" : "eb-admin-link"}><Icon size={17} /><span>{label}</span></NavLink>)}</nav>
        </div>
        <div className="eb-admin-bottom"><div className="eb-admin-user"><div className="eb-admin-avatar">A</div><div><strong>Administrator</strong><small>System access</small></div></div><button className="eb-admin-logout" onClick={() => navigate("/login")}><LogOut size={16} />Log out</button></div>
      </aside>
      <main className="eb-admin-content">
        <div className="eb-admin-mobilebar"><button onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button><strong>Admin panel</strong></div>
        <Navbar title={activeContent.title} onMenu={() => setOpen(true)} hideSearch={location.pathname === "/admin/ledger"} />
        <div className="eb-admin-page">
          <div className="eb-admin-heading"><div><span className="eb-admin-eyebrow">ADMINISTRATION</span><h1>{activeContent.title}</h1><p>{activeContent.description}</p></div><div className="eb-admin-heading-mark"><Gauge size={21} /><span>Live workspace</span></div></div>
          {location.pathname === "/admin" ? <AdminOverview /> : location.pathname === "/admin/users" ? <AdminUsers /> : location.pathname === "/admin/flat-master" ? <AdminFlatMaster /> : location.pathname === "/admin/bills" ? <AdminBills /> : location.pathname === "/admin/edit-bills" ? <AdminEditBill /> : location.pathname === "/admin/payments" ? <AdminPayments /> : location.pathname === "/admin/payment-list" ? <AdminPayments listOnly /> : location.pathname === "/admin/ledger" ? <AdminLedger /> : location.pathname === "/admin/reports" ? <AdminReports /> : location.pathname === "/admin/generate-bill" ? <AdminGenerateBill /> : location.pathname === "/admin/settings" ? <AdminChargeMasters /> : <div className="eb-admin-empty"><div><Settings size={25} /></div><h2>{activeContent.title} is ready</h2><p>This admin tab is connected to the workspace. Add the matching table query here when you are ready to load live records.</p></div>}
        </div>
      </main>
    </div>
  );
}

export default AdminDashboard;
