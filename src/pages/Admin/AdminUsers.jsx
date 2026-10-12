import { useEffect, useState } from "react";
import { KeyRound, Plus, RefreshCw, ShieldCheck, UserRound } from "lucide-react";

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load users.");
      setUsers(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to create user.");
      setForm({ username: "", password: "" });
      setMessage("User created successfully.");
      await loadUsers();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="eb-admin-users">
    <section className="eb-admin-user-create eb-admin-table">
      <div className="eb-admin-table-head"><div><h2>Create user</h2><p>Add an employee account to tb_Employee.</p></div><ShieldCheck size={20} /></div>
      <form className="eb-admin-user-form" onSubmit={handleSubmit}>
        <label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="e.g. billing.admin" autoComplete="username" /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter password" autoComplete="new-password" /></label>
        <button className="eb-btn eb-btn-primary" type="submit" disabled={saving}><Plus size={16} />{saving ? "Creating..." : "Create user"}</button>
      </form>
      {message && <div className="eb-admin-user-message eb-admin-user-success">{message}</div>}
      {error && <div className="eb-admin-user-message eb-admin-user-error">{error}</div>}
    </section>
    <section className="eb-admin-table eb-admin-user-list">
      <div className="eb-admin-table-head"><div><h2>Employee users</h2><p>{users.length} account{users.length === 1 ? "" : "s"} from tb_Employee</p></div><button className="eb-admin-refresh" type="button" onClick={loadUsers} title="Refresh users"><RefreshCw size={17} /></button></div>
      {loading ? <div className="eb-admin-user-state">Loading users...</div> : error && !users.length ? <div className="eb-admin-user-state eb-admin-user-error">{error}</div> : users.length ? <div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>ID</th><th>Username</th><th>Status</th><th>Created date</th></tr></thead><tbody>{users.map((user) => <tr key={user.ID}><td>{user.ID}</td><td><span className="eb-admin-user-name"><UserRound size={15} />{user.Username}</span></td><td><span className="eb-admin-status">{String(user.Status || "Active").trim() || "Active"}</span></td><td>{user.Createdate ? new Date(user.Createdate).toLocaleDateString("en-IN") : "-"}</td></tr>)}</tbody></table></div> : <div className="eb-admin-user-state"><KeyRound size={20} />No employee users found.</div>}
    </section>
  </div>;
}

export default AdminUsers;
