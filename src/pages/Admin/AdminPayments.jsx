import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, FileSpreadsheet, Pencil, Plus, RefreshCw, Save, Search, Table2, Trash2, Upload, X } from "lucide-react";

const empty = { paymentMode: "", bank: "", branch: "", chequeNo: "", chequeDate: "", receiptDate: new Date().toISOString().slice(0, 10), amount: "", flat: "", customerName: "" };
const fieldValue = (record, ...keys) => keys.map((key) => record[key]).find((value) => value !== undefined && value !== null) ?? "";
const normalizeSheetHeader = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const paymentSheetHeaders = {
  flat: ["flatno", "flatnumber", "unitno", "unitnumber", "flat", "unit"],
  customerName: ["customername", "name"],
  paymentMode: ["paymentmode", "modeofpayment", "mode"],
  bank: ["bank", "bankname"],
  branch: ["branch", "branchname"],
  chequeNo: ["cheqnorefeno", "chequerefno", "chequeno", "referenceno", "referencenumber", "transactionid"],
  chequeDate: ["chequerefedate", "chequedate", "referencedate", "transactiondate"],
  amount: ["amount", "paymentamount", "paidamount"],
  receiptDate: ["receiptdate", "paymentdate", "dateofreceipt"],
};
const createMonthlyPaymentRow = (date = new Date()) => ({
  id: `${Date.now()}-${Math.random()}`,
  flat: "",
  flatId: null,
  flatSearch: "",
  customerName: "",
  paymentMode: "",
  bank: "",
  branch: "",
  chequeNo: "",
  chequeDate: "",
  receiptDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  amount: "",
  saved: false,
});
const paymentMonth = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString("en", { month: "short", year: "numeric" }) : "-";
const spreadsheetDateInput = (value, spreadsheet) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && value > 0) {
    const parsed = spreadsheet.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const yearFirst = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (yearFirst) return `${yearFirst[1]}-${yearFirst[2].padStart(2, "0")}-${yearFirst[3].padStart(2, "0")}`;
  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
const readResponse = async (response) => {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error(response.ok ? "Invalid response from server." : `Server error (${response.status}). Restart the API server and try again.`); }
};

function AdminPayments({ listOnly = false }) {
  const [entryMode, setEntryMode] = useState("single");
  const [form, setForm] = useState(empty);
  const [payments, setPayments] = useState([]);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [appliedPaymentSearch, setAppliedPaymentSearch] = useState("");
  const [monthlyRows, setMonthlyRows] = useState(() => [createMonthlyPaymentRow()]);
  const [monthlyFlatRowId, setMonthlyFlatRowId] = useState(null);
  const [monthlyFlatSearch, setMonthlyFlatSearch] = useState("");
  const [monthlyFlatOptions, setMonthlyFlatOptions] = useState([]);
  const [monthlyFlatLoading, setMonthlyFlatLoading] = useState(false);
  const [flatOptions, setFlatOptions] = useState([]);
  const [flatOpen, setFlatOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importingWorkbook, setImportingWorkbook] = useState(false);
  const [savingMonthlyRows, setSavingMonthlyRows] = useState(false);
  const [monthlyMessage, setMonthlyMessage] = useState("");
  const [monthlyError, setMonthlyError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [paymentQuote, setPaymentQuote] = useState(null);
  const paymentFormRef = useRef(null);
  const paymentWorkbookRef = useRef(null);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/payments");
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.message || "Unable to load payments.");
      setPayments(data);
      setError("");
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  };

  useEffect(() => { loadPayments(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/assigned-flats?search=${encodeURIComponent(form.flat)}`, { signal: controller.signal });
        const data = await readResponse(response);
        if (response.ok) setFlatOptions(data);
      } catch (lookupError) { if (lookupError.name !== "AbortError") setFlatOptions([]); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [form.flat]);

  useEffect(() => {
    if (!monthlyFlatRowId || !monthlyFlatSearch.trim()) {
      setMonthlyFlatOptions([]);
      setMonthlyFlatLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMonthlyFlatLoading(true);
      try {
        const response = await fetch(`/api/assigned-flats?search=${encodeURIComponent(monthlyFlatSearch)}`, { signal: controller.signal });
        const data = await readResponse(response);
        if (!response.ok) throw new Error(data.message || "Unable to load assigned flats.");
        setMonthlyFlatOptions(data);
      } catch (lookupError) {
        if (lookupError.name !== "AbortError") {
          setMonthlyFlatOptions([]);
          setMonthlyError(lookupError.message);
        }
      } finally {
        if (!controller.signal.aborted) setMonthlyFlatLoading(false);
      }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [monthlyFlatRowId, monthlyFlatSearch]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const selectFlat = async (flat) => {
    const selectedFlat = flat.UnitNo;
    setForm((current) => ({ ...current, flat: selectedFlat, customerName: flat.customerName || "" }));
    setFlatOpen(false);
    try {
      const response = await fetch(`/api/admin/payment-quote?flat=${encodeURIComponent(selectedFlat)}&paymentDate=${form.receiptDate}`);
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.message || "Unable to calculate payment amount.");
      setPaymentQuote(data);
      if (data.bill) setForm((current) => ({ ...current, flat: selectedFlat, customerName: flat.customerName || "", amount: data.totalAmount.toFixed(2) }));
    } catch (quoteError) { setPaymentQuote(null); setError(quoteError.message); }
  };

  const dateForInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
  const startEdit = (payment) => {
    const paymentId = fieldValue(payment, "ID", "Id", "id", "PaymentID");
    setEditingId(paymentId);
    setForm({
      paymentMode: fieldValue(payment, "PaymentMode", "paymentMode"),
      bank: fieldValue(payment, "Bank", "bank"),
      branch: fieldValue(payment, "Branch", "branch"),
      chequeNo: fieldValue(payment, "ChequeNo", "chequeNo"),
      chequeDate: dateForInput(fieldValue(payment, "ChequeDate", "chequeDate")),
      receiptDate: dateForInput(fieldValue(payment, "ReceiptDate", "receiptDate")),
      amount: fieldValue(payment, "Amount", "amount"),
      flat: fieldValue(payment, "UnitNo", "FlatID", "flat"),
      customerName: fieldValue(payment, "CustomerName", "customerName"),
    });
    setPaymentQuote(null); setFlatOpen(false); setMessage(""); setError("");
    window.setTimeout(() => paymentFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const cancelEdit = () => { setEditingId(null); setForm(empty); setMessage(""); setError(""); };

  const deletePayment = async (payment) => {
    if (!window.confirm(`Delete payment for ${payment.UnitNo || "this flat"}?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/payments/${payment.ID}`, { method: "DELETE" });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.message || "Unable to delete payment.");
      if (editingId === payment.ID) cancelEdit();
      setMessage("Payment deleted successfully.");
      await loadPayments();
    } catch (deleteError) { setError(deleteError.message); }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(editingId ? `/api/admin/payments/${editingId}` : "/api/admin/payments", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.message || "Unable to save payment.");
      const wasEditing = Boolean(editingId);
      setEditingId(null); setForm(empty); setMessage(wasEditing ? "Payment updated successfully." : "Payment saved successfully."); await loadPayments();
    } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  };

  const importMonthlyWorkbook = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingWorkbook(true);
    setMonthlyMessage("");
    setMonthlyError("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a spreadsheet smaller than 10 MB.");
      const spreadsheet = await import("@e965/xlsx");
      const workbook = spreadsheet.read(await file.arrayBuffer(), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error("The workbook does not contain a worksheet.");
      const sheetRows = spreadsheet.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: "" });
      const headerIndex = sheetRows.findIndex((values) => values.some((value) => paymentSheetHeaders.flat.includes(normalizeSheetHeader(value))));
      if (headerIndex < 0) throw new Error("Could not find a Unit No, UnitNo, Flat No, or Flat Number column.");

      const headers = sheetRows[headerIndex].map(normalizeSheetHeader);
      const columns = Object.fromEntries(Object.entries(paymentSheetHeaders).map(([field, aliases]) => [field, headers.findIndex((header) => aliases.includes(header))]));
      for (const required of ["flat", "amount", "receiptDate"]) {
        if (columns[required] < 0) throw new Error(`The workbook is missing a ${required === "flat" ? "Unit No / Flat No" : required} column.`);
      }
      const sourceRows = sheetRows.slice(headerIndex + 1).filter((values) => values.some((value) => String(value ?? "").trim() !== ""));
      if (!sourceRows.length) throw new Error("No payment rows were found below the spreadsheet headings.");
      if (sourceRows.length > 5000) throw new Error("A monthly workbook can contain at most 5,000 payment rows.");

      const importedRows = sourceRows.map((values, index) => {
        const getValue = (field) => columns[field] < 0 ? "" : values[columns[field]];
        const rowNumber = headerIndex + index + 2;
        const flat = String(getValue("flat") ?? "").trim();
        const amount = Number(String(getValue("amount") ?? "").replace(/,/g, "").trim());
        const receiptDate = spreadsheetDateInput(getValue("receiptDate"), spreadsheet);
        if (!flat) throw new Error(`Row ${rowNumber} is missing its Unit No / Flat No.`);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Row ${rowNumber} has an invalid payment amount.`);
        if (!receiptDate) throw new Error(`Row ${rowNumber} has an invalid receipt date.`);
        const chequeDateValue = getValue("chequeDate");
        return {
          id: `${Date.now()}-${index}-${Math.random()}`,
          flatId: null,
          flatSearch: flat,
          saved: false,
          flat,
          customerName: String(getValue("customerName") ?? "").trim(),
          paymentMode: String(getValue("paymentMode") ?? "").trim(),
          bank: String(getValue("bank") ?? "").trim(),
          branch: String(getValue("branch") ?? "").trim(),
          chequeNo: String(getValue("chequeNo") ?? "").trim(),
          chequeDate: spreadsheetDateInput(chequeDateValue, spreadsheet),
          receiptDate,
          amount,
        };
      });
      setMonthlyRows((current) => [...current.filter((row) => row.saved), ...importedRows]);
      setMonthlyMessage(`Imported ${importedRows.length} payment row${importedRows.length === 1 ? "" : "s"} from ${file.name}.`);
    } catch (importError) {
      setMonthlyError(importError.message || "Unable to read this spreadsheet.");
    } finally {
      setImportingWorkbook(false);
    }
  };

  const updateMonthlyRow = (id, field, value) => {
    setMonthlyRows((current) => current.map((row) => row.id === id && !row.saved ? { ...row, [field]: value } : row));
    setMonthlyMessage("");
    setMonthlyError("");
  };

  const searchMonthlyFlat = (row, search) => {
    setMonthlyFlatRowId(row.id);
    setMonthlyFlatSearch(search);
    setMonthlyRows((current) => current.map((item) => item.id === row.id && !item.saved
      ? { ...item, flat: "", flatId: null, flatSearch: search, customerName: "" }
      : item));
  };

  const selectMonthlyFlat = (rowId, flat) => {
    setMonthlyRows((current) => current.map((row) => row.id === rowId
      ? { ...row, flat: flat.UnitNo, flatId: flat.AssignFlatID, flatSearch: flat.UnitNo, customerName: flat.customerName || flat.CustomerName || "" }
      : row));
    setMonthlyFlatRowId(null);
    setMonthlyFlatOptions([]);
    setMonthlyMessage("");
    setMonthlyError("");
  };

  const addMonthlyRow = () => {
    const template = monthlyRows.find((row) => !row.saved) || monthlyRows[0];
    const date = template?.receiptDate ? new Date(`${template.receiptDate}T00:00:00`) : new Date();
    setMonthlyRows((current) => [...current, createMonthlyPaymentRow(date)]);
    setMonthlyMessage("");
    setMonthlyError("");
  };

  const removeMonthlyRow = (id) => {
    setMonthlyRows((current) => current.length > 1 ? current.filter((row) => row.id !== id || row.saved) : current);
    setMonthlyMessage("");
    setMonthlyError("");
  };

  const saveMonthlyPayments = async () => {
    const pendingRows = monthlyRows.filter((row) => !row.saved);
    if (!pendingRows.length) {
      setMonthlyError("Add at least one payment row before saving.");
      return;
    }
    const missingRow = pendingRows.find((row) => !row.flat.trim() || !row.receiptDate || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0);
    if (missingRow) {
      setMonthlyError("Each payment needs an assigned flat, a receipt date, and a valid amount.");
      return;
    }
    if (pendingRows.some((row) => row.chequeDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.chequeDate))) {
      setMonthlyError("Enter a valid cheque/reference date.");
      return;
    }

    setSavingMonthlyRows(true);
    setMonthlyError("");
    setMonthlyMessage("");
    try {
      const response = await fetch("/api/admin/payments/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: pendingRows.map(({ flat, customerName, paymentMode, bank, branch, chequeNo, chequeDate, receiptDate, amount }) => ({
          flat, customerName, paymentMode, bank, branch, chequeNo, chequeDate, receiptDate, amount: Number(amount),
        })) }),
      });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(data.message || "Unable to save monthly payments.");
      setMonthlyRows((current) => current.map((row) => row.saved ? row : { ...row, saved: true }));
      setMonthlyMessage(`Saved ${data.saved} payment${data.saved === 1 ? "" : "s"} across ${data.months} month${data.months === 1 ? "" : "s"}.`);
      await loadPayments();
    } catch (saveError) {
      setMonthlyError(saveError.message);
    } finally {
      setSavingMonthlyRows(false);
    }
  };

  const pendingMonthlyRows = monthlyRows.filter((row) => !row.saved);
  const monthlyTotal = pendingMonthlyRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const monthsInWorkbook = new Set(pendingMonthlyRows.filter((row) => row.receiptDate).map((row) => row.receiptDate.slice(0, 7))).size;
  const normalizedSearch = appliedPaymentSearch.toLowerCase().replace(/[,\s₹]/g, "");
  const filteredPayments = normalizedSearch
    ? payments.filter((payment) => [payment.CustomerName, payment.UnitNo, payment.Amount]
      .some((value) => String(value ?? "").toLowerCase().replace(/[,\s₹]/g, "").includes(normalizedSearch)))
    : payments;

  return <div className="eb-admin-payments">
    {!listOnly && <div className="eb-generate-mode-tabs" role="tablist" aria-label="Payment entry mode">
      <button className={`eb-generate-mode-tab ${entryMode === "single" ? "eb-generate-mode-tab-active" : ""}`} type="button" role="tab" aria-selected={entryMode === "single"} onClick={() => setEntryMode("single")}><CreditCard size={15} />Single Receipt</button>
      <button className={`eb-generate-mode-tab ${entryMode === "monthly" ? "eb-generate-mode-tab-active" : ""}`} type="button" role="tab" aria-selected={entryMode === "monthly"} onClick={() => setEntryMode("monthly")}><Table2 size={15} />Monthly Table</button>
    </div>}
    {!listOnly && entryMode === "single" && <section ref={paymentFormRef} className="eb-admin-table eb-payment-entry">
      <div className="eb-admin-table-head"><div><h2>{editingId ? "Edit payment receipt" : "Generate payment receipt"}</h2><p>{editingId ? "Update the selected payment record." : "Enter payment details for an assigned flat."}</p></div>{editingId ? <button className="eb-admin-refresh" type="button" onClick={cancelEdit} title="Cancel edit"><X size={18} /></button> : <CreditCard size={20} />}</div>
      <form className="eb-payment-form" onSubmit={handleSubmit}>
        <label className="eb-payment-flat-picker">Flat number<input value={form.flat} onChange={update("flat")} onFocus={() => setFlatOpen(true)} placeholder="Type flat number" autoComplete="off" required />{flatOpen && <div className="eb-flat-options">{flatOptions.length ? flatOptions.map((flat) => <button key={flat.AssignFlatID} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectFlat(flat)}><strong>{flat.UnitNo}</strong><small>{flat.customerName || "Customer details"}</small></button>) : <div className="eb-flat-option-status">No matching flat found.</div>}</div>}</label>
        <label>Customer name<input value={form.customerName} onChange={update("customerName")} placeholder="Select flat to bind" /></label>
        <label>Payment mode<select value={form.paymentMode} onChange={update("paymentMode")} required><option value="">Select mode</option><option>IMPS</option><option>NEFT</option><option>Cheque</option><option>Cash</option><option>UPI</option></select></label>
        <label>Bank<input value={form.bank} onChange={update("bank")} placeholder="Bank name" /></label>
        <label>Branch<input value={form.branch} onChange={update("branch")} placeholder="Branch name" /></label>
        <label>Cheque / reference no.<input value={form.chequeNo} onChange={update("chequeNo")} placeholder="Reference number" /></label>
        <label>Cheque date<input type="date" value={form.chequeDate} onChange={update("chequeDate")} /></label>
        <label>Receipt date<input type="date" value={form.receiptDate} onChange={update("receiptDate")} required /></label>
        <label>Amount{paymentQuote?.bill && <small>Includes 18% yearly late penalty after due date</small>}<input type="number" min="0.01" step="0.01" value={form.amount} onChange={update("amount")} placeholder="e.g. 4366" readOnly={Boolean(paymentQuote?.bill)} required /></label>
        <button className="eb-btn eb-btn-primary eb-payment-submit" type="submit" disabled={saving}><Plus size={16} />{saving ? "Saving..." : editingId ? "Update payment" : "Submit"}</button>
      </form>
      {message && <div className="eb-admin-user-message eb-admin-user-success"><CheckCircle2 size={15} />{message}</div>}
      {error && <div className="eb-admin-user-message eb-admin-user-error">{error}</div>}
    </section>}
    {!listOnly && entryMode === "monthly" && <section className="eb-admin-table eb-payment-entry">
      <div className="eb-admin-table-head"><div><h2>Monthly payment entry</h2><p>Add payment rows manually or upload a workbook, then save the payments against each assigned flat.</p></div><FileSpreadsheet size={20} /></div>
      <input ref={paymentWorkbookRef} type="file" accept=".xls,.xlsx" hidden onChange={importMonthlyWorkbook} />
      <div className="eb-monthly-table-wrap"><table className="eb-monthly-table"><thead><tr><th>Unit / flat no.</th><th>Customer</th><th>Month</th><th>Payment mode</th><th>Bank</th><th>Branch</th><th>Cheque / reference</th><th>Cheque date</th><th>Receipt date</th><th>Amount (Rs.)</th><th>Status</th></tr></thead><tbody>
        {monthlyRows.map((row, index) => <tr key={row.id}>
          <td className="eb-monthly-flat-cell"><input aria-label={`Flat number, row ${index + 1}`} value={row.flat || row.flatSearch} placeholder="Search flat number" autoComplete="off" disabled={row.saved || savingMonthlyRows || importingWorkbook} role="combobox" aria-expanded={monthlyFlatRowId === row.id} aria-controls={`monthly-payment-flat-options-${row.id}`} onFocus={() => { setMonthlyFlatRowId(row.id); setMonthlyFlatSearch(row.flatSearch || row.flat); }} onChange={(event) => searchMonthlyFlat(row, event.target.value)} />
            {monthlyFlatRowId === row.id && !row.saved && !savingMonthlyRows && !importingWorkbook && <div className="eb-flat-options" id={`monthly-payment-flat-options-${row.id}`} role="listbox">{monthlyFlatLoading ? <div className="eb-flat-option-status">Loading flats...</div> : monthlyFlatOptions.length ? monthlyFlatOptions.map((flat) => <button key={flat.AssignFlatID} type="button" role="option" aria-selected={row.flatId === flat.AssignFlatID} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMonthlyFlat(row.id, flat)}><strong>{flat.UnitNo}</strong><small>{flat.customerName || flat.CustomerName || "Customer details"}</small></button>) : <div className="eb-flat-option-status">No matching flat found.</div>}</div>}
          </td>
          <td>{row.customerName || "-"}</td>
          <td><strong>{paymentMonth(row.receiptDate)}</strong></td>
          <td><select aria-label={`Payment mode, row ${index + 1}`} value={row.paymentMode} disabled={row.saved || savingMonthlyRows || importingWorkbook} onChange={(event) => updateMonthlyRow(row.id, "paymentMode", event.target.value)}><option value="">Select mode</option><option>IMPS</option><option>NEFT</option><option>Cheque</option><option>Cash</option><option>UPI</option></select></td>
          <td><input aria-label={`Bank, row ${index + 1}`} value={row.bank} placeholder="Bank" disabled={row.saved || savingMonthlyRows || importingWorkbook} onChange={(event) => updateMonthlyRow(row.id, "bank", event.target.value)} /></td>
          <td><input aria-label={`Branch, row ${index + 1}`} value={row.branch} placeholder="Branch" disabled={row.saved || savingMonthlyRows || importingWorkbook} onChange={(event) => updateMonthlyRow(row.id, "branch", event.target.value)} /></td>
          <td><input aria-label={`Cheque or reference number, row ${index + 1}`} value={row.chequeNo} placeholder="Reference no." disabled={row.saved || savingMonthlyRows || importingWorkbook} onChange={(event) => updateMonthlyRow(row.id, "chequeNo", event.target.value)} /></td>
          <td><input aria-label={`Cheque date, row ${index + 1}`} type="date" value={row.chequeDate} disabled={row.saved || savingMonthlyRows || importingWorkbook} onChange={(event) => updateMonthlyRow(row.id, "chequeDate", event.target.value)} /></td>
          <td><input aria-label={`Receipt date, row ${index + 1}`} type="date" value={row.receiptDate} disabled={row.saved || savingMonthlyRows || importingWorkbook} onChange={(event) => updateMonthlyRow(row.id, "receiptDate", event.target.value)} /></td>
          <td><input aria-label={`Amount, row ${index + 1}`} type="number" min="0.01" step="0.01" value={row.amount} placeholder="Amount" disabled={row.saved || savingMonthlyRows || importingWorkbook} onChange={(event) => updateMonthlyRow(row.id, "amount", event.target.value)} /></td>
          <td>{row.saved ? <span className="eb-monthly-row-saved">Saved</span> : <button className="eb-admin-row-pdf eb-monthly-remove" type="button" title="Remove payment row" aria-label={`Remove payment row ${index + 1}`} disabled={savingMonthlyRows || importingWorkbook || monthlyRows.length === 1} onClick={() => removeMonthlyRow(row.id)}><Trash2 size={14} /></button>}</td>
        </tr>)}
      </tbody></table></div>
      <div className="eb-monthly-table-footer">
        <div><strong>{pendingMonthlyRows.length}</strong> payment row{pendingMonthlyRows.length === 1 ? "" : "s"} to save across <strong>{monthsInWorkbook}</strong> month{monthsInWorkbook === 1 ? "" : "s"} · Total <strong>Rs. {monthlyTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small className="eb-monthly-feedback">S No is ignored. Choose an assigned flat and enter the payment details directly, or upload Excel.</small></div>
        <div className="eb-admin-bill-actions">
          <button className="eb-btn eb-btn-light" type="button" disabled={savingMonthlyRows || importingWorkbook} onClick={addMonthlyRow}><Plus size={15} />Add row</button>
          <button className="eb-btn eb-btn-light" type="button" disabled={savingMonthlyRows || importingWorkbook} onClick={() => paymentWorkbookRef.current?.click()}><Upload size={15} />{importingWorkbook ? "Reading Excel..." : "Upload Excel"}</button>
          <button className="eb-btn eb-btn-primary" type="button" disabled={savingMonthlyRows || importingWorkbook || !pendingMonthlyRows.length} onClick={saveMonthlyPayments}><Save size={15} />{savingMonthlyRows ? "Saving payments..." : "Save payments"}</button>
        </div>
      </div>
      {monthlyMessage && <div className="eb-admin-user-message eb-admin-user-success"><CheckCircle2 size={15} />{monthlyMessage}</div>}
      {monthlyError && <div className="eb-admin-user-message eb-admin-user-error">{monthlyError}</div>}
    </section>}
    <section className="eb-admin-table">
      <div className="eb-admin-table-head"><div><h2>Payment records</h2><p>{appliedPaymentSearch ? `${filteredPayments.length} of ${payments.length} payments` : `${payments.length} payment${payments.length === 1 ? "" : "s"}`}</p></div><button className="eb-admin-refresh" type="button" onClick={loadPayments} title="Refresh payments"><RefreshCw size={17} /></button></div>
      {listOnly && <form className="eb-payment-list-filters" onSubmit={(event) => { event.preventDefault(); setAppliedPaymentSearch(paymentSearch.trim()); }}>
        <label className="eb-payment-list-search" htmlFor="payment-list-search"><Search size={16} /><input id="payment-list-search" value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="Search customer name, unit no. or amount" /></label>
        <button className="eb-btn eb-btn-primary" type="submit"><Search size={15} />Search</button>
      </form>}
      {loading ? <div className="eb-admin-user-state">Loading payments...</div> : error && !payments.length ? <div className="eb-admin-user-state eb-admin-user-error">{error}</div> : payments.length ? <div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>Unit No</th><th>Customer</th><th>Payment mode</th><th>Bank</th><th>Branch</th><th>Cheque/ref no.</th><th>Amount</th><th>Receipt date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredPayments.length ? filteredPayments.map((payment) => <tr key={payment.ID}><td>{payment.UnitNo}</td><td>{payment.CustomerName || "-"}</td><td>{payment.PaymentMode || "-"}</td><td>{payment.Bank || "-"}</td><td>{payment.Branch || "-"}</td><td>{payment.ChequeNo || "-"}</td><td>Rs. {Number(payment.Amount || 0).toFixed(2)}</td><td>{payment.ReceiptDate ? new Date(payment.ReceiptDate).toLocaleDateString("en-IN") : "-"}</td><td><span className="eb-admin-status">{String(payment.Status || "Active").trim()}</span></td><td><span className="eb-admin-row-actions"><button className="eb-admin-row-pdf" type="button" onClick={() => startEdit(payment)} title="Edit payment"><Pencil size={14} /></button><button className="eb-admin-row-pdf eb-admin-row-delete" type="button" onClick={() => deletePayment(payment)} title="Delete payment"><Trash2 size={14} /></button></span></td></tr>) : <tr><td colSpan={10} className="eb-admin-user-state">No payment records match your search.</td></tr>}</tbody></table></div> : <div className="eb-admin-user-state"><CreditCard size={20} />No payment records found.</div>}
    </section>
  </div>;
}

export default AdminPayments;
