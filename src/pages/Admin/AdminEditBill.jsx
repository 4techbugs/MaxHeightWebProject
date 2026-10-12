import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FilePenLine, RefreshCw, Save } from "lucide-react";

const emptyForm = {
  flat: "", meter: "", customerName: "", load: "", fromDate: "", toDate: "", billDate: "", dueDate: "",
  grid: "", charge: "", rateAmount: "", gd: "", dgCharge: "", fixedCharge: "495", other: "", arrears: "", penalty: "", discount: "", status: "Pending", remarks: "",
};

const value = (bill, ...keys) => keys.map((key) => bill[key]).find((item) => item !== undefined && item !== null) ?? "";
const number = (input) => Number(input) || 0;
const dateInput = (input) => input ? String(input).slice(0, 10) : "";
const money = (input) => `Rs. ${number(input).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (input) => input ? new Date(input).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Undated bill";
const billId = (bill) => value(bill, "ID", "Id", "id", "BillID");

function formFromBill(bill, flat) {
  return {
    ...emptyForm,
    flat: flat?.UnitNo || value(bill, "FlatID"),
    meter: value(bill, "MeterNumber", "MeeterNumber"),
    customerName: value(bill, "CustomerName"),
    load: value(bill, "Load"),
    fromDate: dateInput(value(bill, "FromDate")), toDate: dateInput(value(bill, "ToDate")),
    billDate: dateInput(value(bill, "BillDate")), dueDate: dateInput(value(bill, "DueDate")),
    grid: value(bill, "Unit"), charge: value(bill, "Charge"), rateAmount: value(bill, "RateAmount", "Charge"),
    gd: value(bill, "DGUnit"), dgCharge: value(bill, "DGCharge", "DGAmount"),
    fixedCharge: value(bill, "FixedCharge", "MiscCharge") === "" ? "495" : value(bill, "FixedCharge", "MiscCharge"),
    other: value(bill, "OtherCharge"), arrears: value(bill, "PreviousBalance", "PriviousBalance"),
    penalty: value(bill, "penalty", "Penalty"), discount: value(bill, "Discount"),
    status: String(value(bill, "Status") || "Pending").trim(), remarks: value(bill, "Remarks"),
  };
}

function AdminEditBill() {
  const navigate = useNavigate();
  const [flats, setFlats] = useState([]);
  const [selectedFlat, setSelectedFlat] = useState(null);
  const [bills, setBills] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loadingFlats, setLoadingFlats] = useState(true);
  const [loadingBills, setLoadingBills] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editFormRef = useRef(null);

  const total = useMemo(() => number(form.rateAmount) + number(form.charge) + number(form.dgCharge) + number(form.fixedCharge) + number(form.other) + number(form.arrears) + number(form.penalty) - number(form.discount), [form]);
  const set = (field) => (event) => { setForm((current) => ({ ...current, [field]: event.target.value })); setMessage(""); setError(""); };

  const loadFlats = async () => {
    setLoadingFlats(true); setError("");
    try {
      const response = await fetch("/api/assigned-flats?search=");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load flats.");
      setFlats(data);
    } catch (loadError) { setError(loadError.message); } finally { setLoadingFlats(false); }
  };

  useEffect(() => { loadFlats(); }, []);

  const chooseFlat = async (event) => {
    const flat = flats.find((item) => String(item.AssignFlatID) === event.target.value);
    setSelectedFlat(flat || null); setSelectedBill(null); setForm(emptyForm); setMessage(""); setError("");
    if (!flat) { setBills([]); return; }
    setLoadingBills(true);
    try {
      const response = await fetch(`/api/bills?flat=${encodeURIComponent(flat.UnitNo)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load bill history.");
      setBills(data);
    } catch (loadError) { setBills([]); setError(loadError.message); } finally { setLoadingBills(false); }
  };

  const openBill = (bill) => {
    const editContext = { bill, flat: selectedFlat };
    sessionStorage.setItem("powerpay-edit-bill", JSON.stringify(editContext));
    navigate("/admin/generate-bill", { state: { editBill: bill, editFlat: selectedFlat } });
  };

  useEffect(() => {
    if (selectedBill) editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedBill]);

  const saveBill = async (event) => {
    event.preventDefault();
    if (!selectedBill) return;
    const id = billId(selectedBill);
    if (!id || !Number.isInteger(Number(id)) || Number(id) <= 0) { setError("This bill does not have a valid database ID."); return; }
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/bills/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, grid: number(form.grid), gd: number(form.gd), charge: number(form.charge), rateAmount: number(form.rateAmount), dgCharge: number(form.dgCharge), fixedCharge: number(form.fixedCharge), other: number(form.other), arrears: number(form.arrears), penalty: number(form.penalty), discount: number(form.discount), total }),
      });
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); } catch { throw new Error(responseText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || `Update failed with status ${response.status}.`); }
      if (!response.ok) throw new Error(data.message || "Unable to update bill.");
      setBills((current) => current.map((bill) => String(billId(bill)) === String(id) ? data.bill : bill));
      setSelectedBill(null); setForm(emptyForm); setMessage("Bill updated successfully.");
    } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  };

  return <div className="eb-admin-edit-bill">
    <section className="eb-admin-table eb-edit-bill-picker"><div className="eb-admin-table-head"><div><h2>Select a flat</h2><p>Choose a flat to view its monthly bill history.</p></div><button className="eb-admin-refresh" type="button" onClick={loadFlats} title="Refresh flats"><RefreshCw size={17} /></button></div><div className="eb-edit-bill-select"><label>Flat number<select value={selectedFlat?.AssignFlatID || ""} onChange={chooseFlat} disabled={loadingFlats}><option value="">{loadingFlats ? "Loading flats..." : "Select a flat"}</option>{flats.map((flat) => <option key={flat.AssignFlatID} value={flat.AssignFlatID}>{flat.UnitNo}{flat.customerName ? ` - ${flat.customerName}` : ""}</option>)}</select></label></div></section>
    {selectedFlat && <section className="eb-admin-table eb-edit-bill-history"><div className="eb-admin-table-head"><div><h2>{selectedFlat.UnitNo} bill history</h2><p>{bills.length} monthly bill{bills.length === 1 ? "" : "s"} found</p></div><CalendarDays size={20} /></div>{loadingBills ? <div className="eb-admin-user-state">Loading bill history...</div> : bills.length ? <div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>Month</th><th>Bill date</th><th>Bill number</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{bills.map((bill) => <tr key={bill.ID}><td>{monthLabel(bill.BillDate)}</td><td>{dateInput(bill.BillDate) || "-"}</td><td>{bill.ReceiptID || `BILL-${bill.ID}`}</td><td>{money(bill.ChargeAmount)}</td><td><span className="eb-admin-status">{String(bill.Status || "Pending").trim()}</span></td><td><button className="eb-admin-row-pdf" type="button" onClick={() => openBill(bill)} title="Edit bill"><FilePenLine size={15} /></button></td></tr>)}</tbody></table></div> : <div className="eb-admin-user-state">No bills found for this flat.</div>}</section>}
    {message && !selectedBill && <div className="eb-admin-user-message eb-admin-user-success">{message}</div>}
    {selectedBill && <form ref={editFormRef} className="eb-admin-table eb-edit-bill-form" onSubmit={saveBill}><div className="eb-admin-table-head"><div><h2>Edit {selectedBill.ReceiptID || `BILL-${selectedBill.ID}`}</h2><p>Update the bill details and save the revised amount.</p></div><strong className="eb-edit-bill-total">{money(total)}</strong></div><div className="eb-edit-bill-fields"><label>Customer name<input value={form.customerName} onChange={set("customerName")} required /></label><label>Meter number<input value={form.meter} onChange={set("meter")} required /></label><label>Load<input value={form.load} onChange={set("load")} /></label><label>Status<select value={form.status} onChange={set("status")}><option>Pending</option><option>Paid</option><option>Overdue</option><option>Cancelled</option></select></label><label>From date<input type="date" value={form.fromDate} onChange={set("fromDate")} required /></label><label>To date<input type="date" value={form.toDate} onChange={set("toDate")} required /></label><label>Bill date<input type="date" value={form.billDate} onChange={set("billDate")} required /></label><label>Due date<input type="date" value={form.dueDate} onChange={set("dueDate")} required /></label><label>Grid units<input type="number" min="0" step="0.01" value={form.grid} onChange={set("grid")} /></label><label>Rate amount<input type="number" min="0" step="0.01" value={form.rateAmount} onChange={set("rateAmount")} /></label><label>Charge amount<input type="number" min="0" step="0.01" value={form.charge} onChange={set("charge")} /></label><label>DG units<input type="number" min="0" step="0.01" value={form.gd} onChange={set("gd")} /></label><label>DG charge<input type="number" min="0" step="0.01" value={form.dgCharge} onChange={set("dgCharge")} /></label><label>Fixed charges<input type="number" min="0" step="0.01" value={form.fixedCharge} onChange={set("fixedCharge")} /></label><label>Other charges<input type="number" min="0" step="0.01" value={form.other} onChange={set("other")} /></label><label>Arrears<input type="number" min="0" step="0.01" value={form.arrears} onChange={set("arrears")} /></label><label>Interest on arrears<input type="number" min="0" step="0.01" value={form.penalty} onChange={set("penalty")} /></label><label>Discount<input type="number" min="0" step="0.01" value={form.discount} onChange={set("discount")} /></label><label className="eb-edit-bill-wide">Remarks<textarea value={form.remarks} onChange={set("remarks")} rows="3" /></label></div><div className="eb-admin-bill-actions"><button className="eb-btn eb-btn-primary" type="submit" disabled={saving}><Save size={16} />{saving ? "Saving..." : "Save changes"}</button></div>{message && <div className="eb-admin-user-message eb-admin-user-success">{message}</div>}{error && <div className="eb-admin-user-message eb-admin-user-error">{error}</div>}</form>}
  </div>;
}

export default AdminEditBill;