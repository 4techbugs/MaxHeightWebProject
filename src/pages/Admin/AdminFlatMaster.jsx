import { useEffect, useRef, useState } from "react";
import { Building2, Download, Plus, RefreshCw, Search, UserPlus, Upload, X } from "lucide-react";

const initialForm = { customerId: "", unitNo: "", flatDetailId: "", floorNo: "", blockId: "", flatAmount: "", additionalAmount: "", arrears: "", bookingDate: new Date().toISOString().slice(0, 10), status: "Active" };
const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "-";
const statusText = (value) => String(value || "Active").trim() || "Active";
const getPageNumbers = (currentPage, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, "ellipsis-start", totalPages - 1, totalPages];
  if (currentPage >= totalPages - 2) return [1, 2, "ellipsis-end", totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis-start", currentPage - 1, currentPage, currentPage + 1, "ellipsis-end", totalPages];
};

async function readApiResponse(response, fallbackMessage) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    if (response.status === 404) throw new Error("The API server does not have the Excel upload route yet. Restart the API server, then try again.");
    throw new Error(`The API returned an unexpected response (HTTP ${response.status}).`);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || fallbackMessage);
  return data;
}

function AdminFlatMaster() {
  const [flats, setFlats] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [flatDetails, setFlatDetails] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [customerQuery, setCustomerQuery] = useState("");
  const [flatDetailQuery, setFlatDetailQuery] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [processingWorkbook, setProcessingWorkbook] = useState(false);
  const [customerForm, setCustomerForm] = useState({ customerName: "", address: "", contactNo: "", mobile: "", dob: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [workbookMessage, setWorkbookMessage] = useState("");
  const [workbookError, setWorkbookError] = useState("");
  const workbookInput = useRef(null);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(flats.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const visibleFlats = flats.slice(pageStart, pageStart + pageSize);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const loadFlats = async (query = search, { throwOnError = false } = {}) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/flat-master?search=${encodeURIComponent(query.trim())}`);
      const data = await readApiResponse(response, "Unable to load flat master.");
      setFlats(data);
    } catch (loadError) {
      if (throwOnError) throw loadError;
      setError(loadError.message);
    } finally { setLoading(false); }
  };

  const loadOptions = async () => {
    try {
      const response = await fetch("/api/admin/flat-master/options");
      const data = await readApiResponse(response, "Unable to load assignment options.");
      setCustomers(data.customers || []); setFlatDetails(data.flatDetails || []);
    } catch (loadError) { setError(loadError.message); }
  };

  useEffect(() => { loadOptions(); loadFlats(""); }, []);
  useEffect(() => {
    setCurrentPage(1);
    const timer = window.setTimeout(() => loadFlats(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const selectedDetail = flatDetails.find((detail) => String(detail.FlatDetailID) === String(form.flatDetailId));
  const customerLabel = (customer) => `${customer.CustomerName || "Unnamed"} · ${customer.CustomerNo || customer.CustomerID}`;
  const detailLabel = (detail) => `Block ${detail.BlockID} · Floor ${detail.FloorNo} · ${detail.FlatTypeName || "Flat type"}${detail.FlatView ? ` · ${detail.FlatView}` : ""}`;
  const findCustomer = (query) => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    return customers.find((customer) => [customerLabel(customer), customer.CustomerName, customer.CustomerNo, customer.CustomerID]
      .some((value) => String(value ?? "").trim().toLowerCase() === normalizedQuery));
  };
  const selectCustomer = (event) => {
    const query = event.target.value;
    const customer = findCustomer(query);
    setCustomerQuery(query);
    setCustomerAddress(customer?.Address || "");
    setCustomerMobile(customer?.Mobile || customer?.ContactNo || "");
    setForm((current) => ({ ...current, customerId: customer ? String(customer.CustomerID) : "" }));
  };
  const selectDetail = (event) => {
    const query = event.target.value;
    const detail = flatDetails.find((item) => detailLabel(item) === query);
    setFlatDetailQuery(query);
    setForm((current) => ({ ...current, flatDetailId: detail ? String(detail.FlatDetailID) : "", floorNo: detail?.FloorNo ?? "", blockId: detail?.BlockID ?? "" }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/flat-master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await readApiResponse(response, "Unable to assign flat.");
      setForm(initialForm); setCustomerQuery(""); setFlatDetailQuery(""); setCustomerAddress(""); setCustomerMobile(""); setMessage("Flat assigned to customer successfully."); await loadFlats(search);
    } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  };

  const createCustomer = async (event) => {
    event.preventDefault(); setCreatingCustomer(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customerForm) });
      const data = await readApiResponse(response, "Unable to create customer.");
      const customer = data.customer;
      setCustomers((current) => [...current, customer]);
      setCustomerQuery(customerLabel(customer));
      setCustomerAddress(customer.Address || "");
      setCustomerMobile(customer.Mobile || customer.ContactNo || "");
      setForm((current) => ({ ...current, customerId: String(customer.CustomerID) }));
      setCustomerForm({ customerName: "", address: "", contactNo: "", mobile: "", dob: "" });
      setCustomerDialogOpen(false);
      setMessage("Customer created and selected successfully.");
    } catch (saveError) { setError(saveError.message); } finally { setCreatingCustomer(false); }
  };

  const exportArrearsWorkbook = async () => {
    setProcessingWorkbook(true); setWorkbookMessage(""); setWorkbookError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const response = await fetch("/api/admin/flat-master");
      const data = await readApiResponse(response, "Unable to load flat arrears.");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Flat Arrears");
      worksheet.addRow(["ID", "Flat No", "Arrears"]);
      data.forEach((flat) => worksheet.addRow([flat.AssignFlatID, String(flat.UnitNo || ""), Number(flat.arrears || 0)]));
      const content = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([content], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "flat-arrears.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setWorkbookMessage(`Downloaded arrears for ${data.length} flats.`);
    } catch (exportError) { setWorkbookError(exportError.message); } finally { setProcessingWorkbook(false); }
  };

  const importArrearsWorkbook = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setProcessingWorkbook(true); setWorkbookMessage(""); setWorkbookError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("The workbook does not contain a worksheet.");
      const headerMap = new Map();
      sheet.getRow(1).eachCell((cell, column) => headerMap.set(String(cell.text).trim().toLowerCase(), column));
      const idColumn = headerMap.get("id");
      const unitNoColumn = headerMap.get("flat no");
      const arrearsColumn = headerMap.get("arrears");
      if (!idColumn || !unitNoColumn || !arrearsColumn) {
        throw new Error("The first row must contain the columns ID, Flat No, and Arrears.");
      }

      const rows = [];
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const idValue = row.getCell(idColumn).value;
        const unitNoValue = row.getCell(unitNoColumn).value;
        const arrearsValue = row.getCell(arrearsColumn).value;
        if ([idValue, unitNoValue, arrearsValue].every((value) => String(value ?? "").trim() === "")) continue;
        rows.push({
          id: Number(idValue),
          unitNo: String(unitNoValue ?? "").trim(),
          arrears: String(arrearsValue ?? "").trim() === "" ? Number.NaN : Number(arrearsValue),
        });
      }
      const response = await fetch("/api/admin/flat-master/arrears-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await readApiResponse(response, "Unable to update flat arrears.");
      setWorkbookMessage(`Updated arrears for ${data.updated} flats.`);
      try {
        await loadFlats(search, { throwOnError: true });
      } catch (refreshError) {
        setWorkbookMessage(`Updated arrears for ${data.updated} flats, but the table could not refresh: ${refreshError.message}`);
      }
    } catch (importError) { setWorkbookError(importError.message || "Unable to read this workbook."); } finally { setProcessingWorkbook(false); }
  };

  return <div className="eb-admin-users">
    <section className="eb-admin-table">
      <div className="eb-admin-table-head"><div><h2>Assign flat to customer</h2><p>Create an assignment in AssignFlat with the selected customer and property details.</p></div><Building2 size={20} /></div>
      <form className="eb-master-form" onSubmit={handleSubmit}>
        <label>Customer<div className="eb-master-customer-input"><input list="flat-master-customers" value={customerQuery} onChange={selectCustomer} placeholder="Type customer name or number" required /><button className="eb-master-inline-action" type="button" onClick={() => setCustomerDialogOpen(true)} title="Create new customer"><UserPlus size={16} /></button></div><datalist id="flat-master-customers">{customers.map((customer) => <option key={customer.CustomerID} value={customerLabel(customer)} />)}</datalist></label>
        <label>Customer address<input value={customerAddress} readOnly placeholder="Auto-filled from customer" /></label>
        <label>Mobile number<input value={customerMobile} readOnly placeholder="Auto-filled from customer" /></label>
        <label>Flat number<input value={form.unitNo} onChange={set("unitNo")} placeholder="A-001" required /></label>
        <label>Flat detail<input list="flat-master-details" value={flatDetailQuery} onChange={selectDetail} placeholder="Type block, floor or type" required /><datalist id="flat-master-details">{flatDetails.map((detail) => <option key={detail.FlatDetailID} value={detailLabel(detail)} />)}</datalist></label>
        <label>Floor<input type="number" value={form.floorNo} onChange={set("floorNo")} required /></label>
        <label>Block<input type="number" value={form.blockId} onChange={set("blockId")} required /></label>
        <label>Flat amount<input type="number" min="0" step="0.01" value={form.flatAmount} onChange={set("flatAmount")} placeholder="0.00" /></label>
        <label>Additional amount<input type="number" min="0" step="0.01" value={form.additionalAmount} onChange={set("additionalAmount")} placeholder="0.00" /></label>
        <label>Arrears<input type="number" min="0" step="0.01" value={form.arrears} onChange={set("arrears")} placeholder="0.00" /></label>
        <label>Booking date<input type="date" value={form.bookingDate} onChange={set("bookingDate")} required /></label>
        <label>Status<select value={form.status} onChange={set("status")}><option>Active</option><option>Booked</option><option>Transferred</option><option>Inactive</option></select></label>
        <div><button className="eb-btn eb-btn-primary" type="submit" disabled={saving}><Plus size={16} />{saving ? "Saving..." : "Assign flat"}</button></div>
      </form>
      {selectedDetail && <div className="eb-admin-user-message">Type: {selectedDetail.FlatTypeName || "-"} · Area: {selectedDetail.Area || "-"} · View: {selectedDetail.FlatView || "-"}</div>}
      {message && <div className="eb-admin-user-message eb-admin-user-success">{message}</div>}{error && <div className="eb-admin-user-message eb-admin-user-error">{error}</div>}
    </section>
    {customerDialogOpen && <div className="eb-master-modal-backdrop" role="presentation"><form className="eb-master-modal" onSubmit={createCustomer}><div className="eb-admin-table-head"><div><h2>Create customer</h2><p>Add this customer to the Customer table and use them for this flat.</p></div><button className="eb-admin-refresh" type="button" onClick={() => setCustomerDialogOpen(false)} title="Close"><X size={18} /></button></div><div className="eb-master-modal-fields"><label>Customer name<input value={customerForm.customerName} onChange={(event) => setCustomerForm((current) => ({ ...current, customerName: event.target.value }))} placeholder="Full name" required autoFocus /></label><label>Address<input value={customerForm.address} onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))} placeholder="Customer address" /></label><label>Contact number<input value={customerForm.contactNo} onChange={(event) => setCustomerForm((current) => ({ ...current, contactNo: event.target.value }))} placeholder="Contact number" /></label><label>Mobile number<input value={customerForm.mobile} onChange={(event) => setCustomerForm((current) => ({ ...current, mobile: event.target.value }))} placeholder="Mobile number" /></label><label>Date of birth<input type="date" value={customerForm.dob} onChange={(event) => setCustomerForm((current) => ({ ...current, dob: event.target.value }))} required /></label></div><div className="eb-master-modal-actions"><button className="eb-btn eb-btn-light" type="button" onClick={() => setCustomerDialogOpen(false)}>Cancel</button><button className="eb-btn eb-btn-primary" type="submit" disabled={creatingCustomer}><Plus size={16} />{creatingCustomer ? "Creating..." : "Create customer"}</button></div></form></div>}
    <section className="eb-admin-table">
      <div className="eb-admin-table-head"><div><h2>Assigned flats</h2><p>{flats.length} flat record{flats.length === 1 ? "" : "s"}</p></div><div className="eb-flat-arrears-actions"><input ref={workbookInput} type="file" accept=".xlsx" onChange={importArrearsWorkbook} hidden /><button className="eb-btn eb-btn-light" type="button" onClick={exportArrearsWorkbook} disabled={processingWorkbook}><Download size={15} />Download Excel</button><button className="eb-btn eb-btn-light" type="button" onClick={() => workbookInput.current?.click()} disabled={processingWorkbook}><Upload size={15} />Upload Excel</button><button className="eb-admin-refresh" type="button" onClick={() => loadFlats()} title="Refresh flat master"><RefreshCw size={17} /></button></div></div>
      {workbookMessage && <div className="eb-admin-user-message eb-admin-user-success">{workbookMessage}</div>}{workbookError && <div className="eb-admin-user-message eb-admin-user-error">{workbookError}</div>}
      <div className="eb-admin-ledger-filters"><label className="eb-admin-ledger-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search flat, customer or customer number" /></label></div>
      {loading ? <div className="eb-admin-user-state">Loading flat master...</div> : error && !flats.length ? <div className="eb-admin-user-state eb-admin-user-error">{error}</div> : flats.length ? <><div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>Flat no.</th><th>Customer</th><th>Flat type</th><th>Area</th><th>Floor / block</th><th>View</th><th>Flat amount</th><th>Additional</th><th>Arrears</th><th>Booking date</th><th>Status</th></tr></thead><tbody>{visibleFlats.map((flat) => <tr key={flat.AssignFlatID}><td><strong>{flat.UnitNo || "-"}</strong><small>ID {flat.AssignFlatID}</small></td><td><strong>{flat.CustomerName || "-"}</strong><small>{flat.CustomerNo || flat.ContactNo || flat.Mobile || "-"}</small></td><td>{flat.FlatTypeName || "-"}</td><td>{flat.Area || "-"}</td><td>{flat.FloorNo ?? flat.AssignedFloorNo ?? "-"} / {flat.BlockID ?? "-"}</td><td>{flat.FlatView || "-"}</td><td>{money(flat.FlatAmount)}</td><td>{money(flat.AdditionalAmount)}</td><td>{money(flat.arrears)}</td><td>{dateText(flat.BookingDate)}</td><td><span className="eb-admin-status">{statusText(flat.FlatStatus)}</span></td></tr>)}</tbody></table></div><div className="eb-flat-pagination"><span>Showing {pageStart + 1} to {Math.min(pageStart + pageSize, flats.length)} of {flats.length} entries</span><div className="eb-flat-page-buttons"><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>‹</button>{pageNumbers.map((page) => page.toString().startsWith("ellipsis") ? <span className="eb-flat-page-ellipsis" key={page}>...</span> : <button key={page} type="button" className={currentPage === page ? "eb-flat-page-active" : ""} aria-current={currentPage === page ? "page" : undefined} onClick={() => setCurrentPage(page)}>{page}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>›</button></div></div></> : <div className="eb-admin-user-state">No flat records found.</div>}
    </section>
  </div>;
}

export default AdminFlatMaster;
