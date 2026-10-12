import { useEffect, useState } from "react";
import { Database, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

const masters = [
  { type: "Fuel Search Charges", label: "Fuel Search Charges" },
  { type: "CT/DT Rent", label: "CT/DT Rent" },
  { type: "Duty", label: "Duty" },
];

function AdminChargeMasters() {
  const [active, setActive] = useState(masters[0].type);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({ amount: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);

  const loadRecords = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/charge-masters?type=${encodeURIComponent(active)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load master records.");
      setRecords(data);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  };

  useEffect(() => { loadRecords(); }, [active]);

  const handleSubmit = async (event) => {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(editingId ? `/api/admin/charge-masters/${editingId}` : "/api/admin/charge-masters", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(form.amount), masterType: active }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to save master record.");
      setEditingId(null); setForm({ amount: "" }); setMessage(editingId ? "Master amount updated successfully." : "Master amount saved successfully."); await loadRecords();
    } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  };

  const startEdit = (record) => { setEditingId(record.ID); setForm({ amount: String(record.Amount) }); setMessage(""); setError(""); };
  const deleteRecord = async (record) => {
    if (!window.confirm(`Delete ${record.MasterType} amount?`)) return;
    try {
      const response = await fetch(`/api/admin/charge-masters/${record.ID}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to delete master.");
      setMessage("Master record deleted successfully."); await loadRecords();
    } catch (deleteError) { setError(deleteError.message); }
  };

  return <div className="eb-admin-masters">
    <div className="eb-master-tabs">{masters.map((master) => <button key={master.type} className={active === master.type ? "eb-master-tab eb-master-tab-active" : "eb-master-tab"} type="button" onClick={() => { setActive(master.type); setMessage(""); setForm({ amount: "" }); }}>{master.label}</button>)}</div>
    <section className="eb-admin-table">
      <div className="eb-admin-table-head"><div><h2>{active}</h2><p>Set the amount for this master.</p></div><Database size={20} /></div>
      <form className="eb-master-form eb-master-form-simple" onSubmit={handleSubmit}><label>Amount<input type="number" step="0.01" value={form.amount} onChange={(event) => setForm({ amount: event.target.value })} placeholder="0.00" required /></label><button className="eb-btn eb-btn-primary" type="submit" disabled={saving}><Plus size={16} />{saving ? "Saving..." : editingId ? "Update amount" : "Save amount"}</button></form>
      {message && <div className="eb-admin-user-message eb-admin-user-success">{message}</div>}{error && <div className="eb-admin-user-message eb-admin-user-error">{error}</div>}
    </section>
    <section className="eb-admin-table"><div className="eb-admin-table-head"><div><h2>{active} list</h2><p>{records.length} record{records.length === 1 ? "" : "s"}</p></div><button className="eb-admin-refresh" type="button" onClick={loadRecords} title="Refresh"><RefreshCw size={17} /></button></div>{loading ? <div className="eb-admin-user-state">Loading records...</div> : records.length ? <div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>Master type</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.map((record) => <tr key={record.ID}><td>{record.MasterType}</td><td>Rs. {Number(record.Amount).toFixed(2)}</td><td><span className="eb-admin-status">{String(record.Status || "Active").trim()}</span></td><td><span className="eb-admin-row-actions"><button className="eb-admin-row-pdf" type="button" onClick={() => startEdit(record)} title="Edit amount"><Pencil size={14} /></button><button className="eb-admin-row-pdf eb-admin-row-delete" type="button" onClick={() => deleteRecord(record)} title="Delete master"><Trash2 size={14} /></button></span></td></tr>)}</tbody></table></div> : <div className="eb-admin-user-state">No records found.</div>}</section>
  </div>;
}

export default AdminChargeMasters;
