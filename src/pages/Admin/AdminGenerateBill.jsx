import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarPlus, Calculator, FileSpreadsheet, Printer, RotateCcw, Save, Table2, Trash2, Upload } from "lucide-react";

const empty = { flat: "", meter: "", grid: "", gd: "", arrears: "", customerName: "", load: "", previousBalance: "", fromDate: "", toDate: "", billDate: "", dueDate: "", chargeRate: "1", dgCharge: "26", penalty: "0", discount: "0" };

const getFlatField = (flat, ...keys) => {
  for (const key of keys) {
    const value = flat?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};

const dateInputValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const chunkOptions = (options, size = 10) => Array.from({ length: Math.ceil(options.length / size) }, (_, index) => options.slice(index * size, index * size + size));
const normalizeSheetHeader = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sheetHeaders = {
  flat: ["flatno", "flatnumber", "unitno", "unitnumber", "flat", "flatcustomer"],
  customerName: ["customername", "name"],
  meter: ["meterno", "meternumber", "meter", "meeterno", "meeternumber", "meeter"],
  fromDate: ["fromdate", "datefrom", "from", "periodfrom", "startdate"],
  toDate: ["todate", "dateto", "to", "periodto", "enddate"],
  billDate: ["billdate", "issuedate"],
  dueDate: ["duedate", "paymentduedate"],
  grid: ["unit", "gridunits", "gridunit", "gridkwh", "units", "unitconsumption", "kwh"],
  gd: ["gdunit", "gdunits", "dgunits", "dgunit", "dg", "dgconsumption", "generatorunits"],
  arrears: ["arrears", "previousbalance", "outstandingbalance"],
  penalty: ["interest", "penalty", "interestonarrears"],
  discount: ["discount"],
  load: ["load", "sanctionedload"],
};
const sheetDateInput = (value, spreadsheet) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateInputValue(value);
  if (typeof value === "number" && value > 0) {
    const parsed = spreadsheet.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const yearFirst = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (yearFirst) return `${yearFirst[1]}-${yearFirst[2].padStart(2, "0")}-${yearFirst[3].padStart(2, "0")}`;
  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : dateInputValue(parsed);
};
const createMonthlyRow = (date = new Date(), arrears = "0") => {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const due = new Date(to);
  due.setDate(due.getDate() + 15);
  return {
    id: `${Date.now()}-${Math.random()}`,
    fromDate: dateInputValue(from), toDate: dateInputValue(to),
    billDate: dateInputValue(to), dueDate: dateInputValue(due),
    flat: "", flatId: null, flatSearch: "", meter: "", customerName: "", load: "", address: "",
    grid: "", gd: "", arrears: String(arrears), penalty: "0", discount: "0", saved: false,
  };
};

function calculateSlab(units, slabs) {
  let remaining = units;
  let previous = 0;
  let rateAmount = 0;
  let chargeAmount = 0;
  for (const slab of slabs) {
    if (remaining <= 0) break;
    const upper = Number(slab.UnitSlab2);
    const lower = Number(slab.UnitSlab1 ?? previous);
    const used = Math.min(remaining, Math.max(0, upper - Math.max(previous, lower)));
    rateAmount += used * Number(slab.Rate || 0);
    chargeAmount += used * Number(slab.Charge || 0);
    remaining -= used;
    previous = upper;
  }
  if (remaining > 0 && slabs.length) {
    const last = slabs[slabs.length - 1];
    rateAmount += remaining * Number(last.Rate || 0);
    chargeAmount += remaining * Number(last.Charge || 0);
  }
  return { rateAmount, chargeAmount };
}

function AdminGenerateBill() {
  const location = useLocation();
  const [billMode, setBillMode] = useState("single");
  const [form, setForm] = useState(empty);
  const [monthlyRows, setMonthlyRows] = useState(() => [createMonthlyRow()]);
  const [savingMonthlyRows, setSavingMonthlyRows] = useState(false);
  const [importingMonthlyWorkbook, setImportingMonthlyWorkbook] = useState(false);
  const [monthlyMessage, setMonthlyMessage] = useState("");
  const [monthlyError, setMonthlyError] = useState("");
  const [monthlyFlatRowId, setMonthlyFlatRowId] = useState(null);
  const [monthlyFlatSearch, setMonthlyFlatSearch] = useState("");
  const [monthlyFlatOptions, setMonthlyFlatOptions] = useState([]);
  const [monthlyFlatLoading, setMonthlyFlatLoading] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [editingStatus, setEditingStatus] = useState("Pending");
  const [saved, setSaved] = useState(false);
  const [flatOptions, setFlatOptions] = useState([]);
  const [flatOpen, setFlatOpen] = useState(false);
  const [flatLoading, setFlatLoading] = useState(false);
  const [billRates, setBillRates] = useState({ slabs: [], fixedCharges: [] });
  const [editingMaster, setEditingMaster] = useState(null);
  const [masterEditAmount, setMasterEditAmount] = useState("");
  const [masterEditSaving, setMasterEditSaving] = useState(false);
  const flatPickerRef = useRef(null);
  const monthlyWorkbookRef = useRef(null);
  const set = (field) => (event) => { setForm((current) => ({ ...current, [field]: event.target.value })); setSaved(false); };
  const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value) || 0]));
  const slabAmounts = useMemo(() => calculateSlab(values.grid, billRates.slabs), [values.grid, billRates.slabs]);
  const fixedCharges = 495;
  const dgAmount = values.gd * values.dgCharge;
  const masterAmount = (type) => Number(billRates.masters?.find((master) => master.MasterType === type)?.Amount || 0);
  const masterDisplayAmount = (type) => masterAmount(type).toFixed(2);
  const masterRecord = (type) => billRates.masters?.find((master) => master.MasterType === type);
  const openMasterEdit = (type) => { const master = masterRecord(type); setEditingMaster(master); setMasterEditAmount(String(master?.Amount ?? "")); };
  const closeMasterEdit = () => { if (!masterEditSaving) { setEditingMaster(null); setMasterEditAmount(""); } };
  const saveMasterEdit = async () => {
    if (!editingMaster?.ID || !Number.isFinite(Number(masterEditAmount))) return;
    setMasterEditSaving(true);
    try {
      const response = await fetch(`/api/admin/charge-masters/${editingMaster.ID}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(masterEditAmount) }) });
      if (!response.ok) throw new Error("Unable to update master amount.");
      setBillRates((current) => ({ ...current, masters: (current.masters || []).map((master) => master.ID === editingMaster.ID ? { ...master, Amount: Number(masterEditAmount) } : master) }));
      setEditingMaster(null); setMasterEditAmount("");
    } catch (error) { alert(error.message); } finally { setMasterEditSaving(false); }
  };
  const fuelSearchCharges = values.grid * masterAmount("Fuel Search Charges");
  const ctDtRent = masterAmount("CT/DT Rent");
  const dutyCharges = values.grid * masterAmount("Duty");
  const masterCharges = fuelSearchCharges + ctDtRent + dutyCharges;
  const total = slabAmounts.rateAmount + slabAmounts.chargeAmount + values.arrears + values.penalty - values.discount + dgAmount + fixedCharges + masterCharges;
  const monthlyFlatOptionSections = chunkOptions(monthlyFlatOptions);
  const flatOptionSections = chunkOptions(flatOptions);
  const monthlyCalculations = monthlyRows.map((row) => {
    const grid = Number(row.grid) || 0;
    const gd = Number(row.gd) || 0;
    const arrears = Number(row.arrears) || 0;
    const penalty = Number(row.penalty) || 0;
    const discount = Number(row.discount) || 0;
    const slab = calculateSlab(grid, billRates.slabs);
    const monthlyDgAmount = gd * 26;
    const fuel = grid * masterAmount("Fuel Search Charges");
    const duty = grid * masterAmount("Duty");
    return {
      ...slab,
      dgAmount: monthlyDgAmount,
      fuel,
      duty,
      total: slab.rateAmount + slab.chargeAmount + monthlyDgAmount + fuel + ctDtRent + duty + fixedCharges + arrears + penalty - discount,
    };
  });

  useEffect(() => {
    fetch("/api/bill-rates").then((response) => response.json()).then(setBillRates).catch(() => {});
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("powerpay-edit-bill");
    const context = location.state?.editBill ? { bill: location.state.editBill, flat: location.state.editFlat } : stored ? JSON.parse(stored) : null;
    if (!context?.bill) return;
    try {
      const { bill, flat } = context;
      const dateValue = (value) => value ? String(value).slice(0, 10) : "";
      const first = (...keys) => keys.map((key) => bill[key]).find((value) => value !== undefined && value !== null) ?? "";
      setEditingBillId(first("ID", "Id", "id", "BillID"));
      setEditingStatus(String(first("Status") || "Pending").trim());
      setForm({
        ...empty,
        flat: flat?.UnitNo || first("FlatID"), meter: first("MeterNumber", "MeeterNumber"), customerName: first("CustomerName"), load: first("Load"),
        grid: first("Unit"), gd: first("DGUnit"), arrears: first("PreviousBalance", "PriviousBalance"), penalty: first("penalty", "Penalty"), discount: first("Discount"),
        fromDate: dateValue(first("FromDate")), toDate: dateValue(first("ToDate")), billDate: dateValue(first("BillDate")), dueDate: dateValue(first("DueDate")),
        dgCharge: first("DGUnit") ? String(Number(first("DGCharge", "DGAmount")) / Number(first("DGUnit")) || 26) : "26",
      });
      sessionStorage.removeItem("powerpay-edit-bill");
    } catch {
      sessionStorage.removeItem("powerpay-edit-bill");
    }
  }, [location.state]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setFlatLoading(true);
      try {
        const response = await fetch(`/api/assigned-flats?search=${encodeURIComponent(form.flat)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setFlatOptions(data);
      } catch (error) {
        if (error.name !== "AbortError") setFlatOptions([]);
      } finally {
        if (!controller.signal.aborted) setFlatLoading(false);
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [form.flat]);

  useEffect(() => {
    if (!monthlyFlatRowId) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMonthlyFlatLoading(true);
      try {
        const response = await fetch(`/api/assigned-flats?search=${encodeURIComponent(monthlyFlatSearch)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load flats.");
        setMonthlyFlatOptions(data);
      } catch (error) {
        if (error.name !== "AbortError") setMonthlyFlatOptions([]);
      } finally {
        if (!controller.signal.aborted) setMonthlyFlatLoading(false);
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [monthlyFlatRowId, monthlyFlatSearch]);

  const selectFlat = async (flat) => {
    const flatMeter = getFlatField(flat, "meter", "MeterNumber", "MeeterNumber");
    const flatCustomerName = getFlatField(flat, "customerName", "CustomerName");
    const flatLoad = getFlatField(flat, "load", "Load");
    const flatPreviousBalance = Number(getFlatField(flat, "previousBalance", "PreviousBalance", "PriviousBalance") || 0);
    let penalty = Number(flat.previousPenalty || flat.PreviousPenalty || 0);
    try {
      const response = await fetch(`/api/flat-penalty/${flat.AssignFlatID}`);
      if (response.ok) {
        const data = await response.json();
        penalty = Number(data.penaltyAmount || 0);
      }
    } catch {
    }

    setForm((current) => ({
      ...current,
      flat: flat.UnitNo,
      meter: flatMeter,
      customerName: flatCustomerName,
      load: flatLoad,
      previousBalance: flatPreviousBalance,
      arrears: flatPreviousBalance,
      penalty,
    }));
    setSaved(false);
    setFlatOpen(false);
  };

  const updateMonthlyRow = (id, field, value) => {
    setMonthlyRows((current) => current.map((row) => row.id === id && !row.saved ? { ...row, [field]: value } : row));
    setMonthlyMessage("");
    setMonthlyError("");
  };

  const searchMonthlyFlat = (row, value) => {
    setMonthlyFlatRowId(row.id);
    setMonthlyFlatSearch(value);
    setMonthlyRows((current) => current.map((item) => item.id === row.id && !item.saved ? {
      ...item, flat: "", flatId: null, flatSearch: value, meter: "", customerName: "", load: "", address: "", arrears: "0", penalty: "0",
    } : item));
  };

  const selectMonthlyFlat = (rowId, flat) => {
    const flatMeter = getFlatField(flat, "meter", "MeterNumber", "MeeterNumber");
    const flatCustomerName = getFlatField(flat, "customerName", "CustomerName");
    const flatLoad = getFlatField(flat, "load", "Load");
    const flatAddress = getFlatField(flat, "address", "Address");
    const flatPreviousBalance = Number(getFlatField(flat, "previousBalance", "PreviousBalance", "PriviousBalance") || 0);
    const flatPreviousPenalty = Number(getFlatField(flat, "previousPenalty", "PreviousPenalty") || 0);

    setMonthlyRows((current) => current.map((row) => row.id === rowId ? {
      ...row,
      flat: flat.UnitNo,
      flatId: flat.AssignFlatID,
      flatSearch: flat.UnitNo,
      meter: flatMeter,
      customerName: flatCustomerName,
      load: flatLoad,
      address: flatAddress,
      arrears: String(flatPreviousBalance),
      penalty: String(flatPreviousPenalty),
    } : row));
    setMonthlyFlatRowId(null);
    setMonthlyFlatOptions([]);
    setMonthlyMessage("");
    setMonthlyError("");
  };

  const addMonthlyRow = () => {
    const template = monthlyRows.find((row) => !row.saved) || monthlyRows[0];
    const periodStart = template?.fromDate ? new Date(`${template.fromDate}T00:00:00`) : new Date();
    const row = createMonthlyRow(periodStart, "0");
    if (template) {
      row.fromDate = template.fromDate;
      row.toDate = template.toDate;
      row.billDate = template.billDate;
      row.dueDate = template.dueDate;
    }
    setMonthlyRows((current) => [...current, row]);
    setMonthlyMessage("");
    setMonthlyError("");
  };

  const importMonthlyWorkbook = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingMonthlyWorkbook(true);
    setMonthlyMessage("");
    setMonthlyError("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a spreadsheet smaller than 10 MB.");
      const spreadsheet = await import("@e965/xlsx");
      const workbook = spreadsheet.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error("The workbook does not contain a worksheet.");
      const sheetRows = spreadsheet.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: "" });
      const headerIndex = sheetRows.findIndex((values) => values.some((value) => sheetHeaders.flat.includes(normalizeSheetHeader(value))));
      if (headerIndex < 0) throw new Error("Could not find a Flat No, Flat Number, or Unit No column in the first worksheet.");

      const headers = sheetRows[headerIndex].map(normalizeSheetHeader);
      const columns = Object.fromEntries(Object.entries(sheetHeaders).map(([field, aliases]) => [field, headers.findIndex((header) => aliases.includes(header))]));
      const getValue = (values, field) => columns[field] < 0 ? "" : values[columns[field]];
      const sourceRows = sheetRows.slice(headerIndex + 1).filter((values) => values.some((value) => String(value ?? "").trim() !== ""));
      if (!sourceRows.length) throw new Error("No bill rows were found below the spreadsheet headings.");

      const parsedRows = sourceRows.map((values) => {
        const flat = String(getValue(values, "flat") ?? "").trim();
        const row = createMonthlyRow();
        const dateFields = ["fromDate", "toDate", "billDate", "dueDate"];
        const imported = Object.fromEntries(dateFields.map((field) => [field, sheetDateInput(getValue(values, field), spreadsheet)]));
        for (const field of ["grid", "gd", "arrears", "penalty", "discount"]) {
          const value = getValue(values, field);
          if (String(value ?? "").trim() !== "") imported[field] = String(value).trim();
        }
        const customerName = String(getValue(values, "customerName") ?? "").trim();
        const meter = String(getValue(values, "meter") ?? "").trim();
        const load = String(getValue(values, "load") ?? "").trim();
        return { ...row, ...imported, flat, flatSearch: flat, customerName, meter, load };
      });

      const savedRows = monthlyRows.filter((row) => row.saved);

      const flatNumbers = [...new Set(parsedRows.map((row) => row.flat).filter(Boolean))];
      const matchedFlats = new Map(await Promise.all(flatNumbers.map(async (flatNumber) => {
        const response = await fetch(`/api/assigned-flats?search=${encodeURIComponent(flatNumber)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to match spreadsheet flats.");
        const match = data.find((item) => String(item.UnitNo || "").trim().toLowerCase() === flatNumber.toLowerCase());
        return [flatNumber.toLowerCase(), match || null];
      })));

      const importedRows = parsedRows.map((row) => {
        const flatRecord = matchedFlats.get(row.flat.toLowerCase());
        if (!flatRecord) return row;
        return {
          ...row,
          flat: flatRecord.UnitNo,
          flatId: flatRecord.AssignFlatID,
          flatSearch: flatRecord.UnitNo,
          customerName: row.customerName || getFlatField(flatRecord, "customerName", "CustomerName"),
          meter: row.meter || getFlatField(flatRecord, "meter", "MeterNumber", "MeeterNumber"),
          load: row.load || getFlatField(flatRecord, "load", "Load"),
          address: getFlatField(flatRecord, "address", "Address"),
          arrears: columns.arrears >= 0 ? row.arrears : String(getFlatField(flatRecord, "previousBalance", "PreviousBalance", "PriviousBalance") || 0),
          penalty: columns.penalty >= 0 ? row.penalty : String(getFlatField(flatRecord, "previousPenalty", "PreviousPenalty") || 0),
        };
      });

      setMonthlyRows([...savedRows, ...importedRows]);
      setMonthlyFlatRowId(null);
      setMonthlyFlatOptions([]);
      const unmatched = importedRows.filter((row) => !row.flatId).length;
      setMonthlyMessage(`Imported ${importedRows.length} row${importedRows.length === 1 ? "" : "s"} from ${file.name}.`);
      if (unmatched) setMonthlyError(`${unmatched} flat${unmatched === 1 ? " was" : "s were"} not matched to an assigned flat. Select ${unmatched === 1 ? "it" : "them"} from the Flat / customer field before saving.`);
    } catch (error) {
      setMonthlyError(error.message || "Unable to read this spreadsheet.");
    } finally {
      setImportingMonthlyWorkbook(false);
    }
  };

  const removeMonthlyRow = (id) => setMonthlyRows((current) => current.filter((row) => row.id !== id || row.saved));

  const saveMonthlyBills = async () => {
    const pendingRows = monthlyRows.filter((row) => !row.saved);
    if (!pendingRows.length) {
      setMonthlyMessage("All monthly bills in this table have already been saved.");
      return;
    }
    const rowsMissingDetails = pendingRows
      .map((row) => ({
        row,
        rowNumber: monthlyRows.findIndex((item) => item.id === row.id) + 1,
        missing: [
          !String(row.flat || "").trim() && "flat",
          !String(row.meter || "").trim() && "meter number",
        ].filter(Boolean),
      }))
      .filter(({ missing }) => missing.length);
    const rowsToSave = pendingRows.filter((row) => String(row.flat || "").trim() && String(row.meter || "").trim());
    const skippedRowDetails = rowsMissingDetails.slice(0, 5).map(({ rowNumber, missing }) => `row ${rowNumber} needs ${missing.join(" and ")}`);
    const remainingSkippedRows = rowsMissingDetails.length - skippedRowDetails.length;
    const skippedRowsMessage = rowsMissingDetails.length
      ? `Skipped ${rowsMissingDetails.length} row${rowsMissingDetails.length === 1 ? "" : "s"} with missing details: ${skippedRowDetails.join("; ")}${remainingSkippedRows ? `; and ${remainingSkippedRows} more` : ""}. Enter the actual values before saving those rows.`
      : "";
    if (!rowsToSave.length) {
      setMonthlyError(skippedRowsMessage || "Enter a flat and meter number before saving.");
      return;
    }
    for (const row of rowsToSave) {
      if (!row.fromDate || !row.toDate || !row.billDate || !row.dueDate) {
        setMonthlyError("Enter From, To, Bill, and Due dates for every bill being saved.");
        return;
      }
      if (row.fromDate > row.toDate) {
        setMonthlyError("A billing period's From date cannot be after its To date.");
        return;
      }
    }
    const periodKeys = rowsToSave.map((row) => `${row.flatId || row.flat.trim().toLowerCase()}:${row.fromDate}:${row.toDate}`);
    if (new Set(periodKeys).size !== periodKeys.length) {
      setMonthlyError("A flat has duplicate billing periods in the table.");
      return;
    }

    setSavingMonthlyRows(true);
    setMonthlyError("");
    setMonthlyMessage("");
    let savedCount = 0;
    try {
      for (const row of rowsToSave) {
        const calculation = monthlyCalculations.find((item, index) => monthlyRows[index].id === row.id);
        const payload = {
          flat: row.flat, meter: row.meter, customerName: row.customerName, load: row.load,
          address: row.address, grid: Number(row.grid) || 0, gd: Number(row.gd) || 0,
          arrears: Number(row.arrears) || 0, charge: calculation.chargeAmount, rateAmount: calculation.rateAmount,
          dgCharge: calculation.dgAmount, dgAmount: calculation.dgAmount,
          fuelSearchCharge: calculation.fuel, ctDtRent, dutyCharge: calculation.duty,
          fixedCharge: fixedCharges, penalty: Number(row.penalty) || 0, discount: Number(row.discount) || 0,
          total: calculation.total, totalPaidAmount: calculation.total,
          fromDate: row.fromDate, toDate: row.toDate, billDate: row.billDate, dueDate: row.dueDate,
          status: "Pending", createdBy: "admin",
        };
        const response = await fetch("/api/bills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Unable to save the bill for ${row.fromDate}.`);
        savedCount += 1;
        setMonthlyRows((current) => current.map((item) => item.id === row.id ? { ...item, saved: true } : item));
        setMonthlyMessage(`Saved ${savedCount} of ${rowsToSave.length} monthly bills.`);
      }
      setMonthlyMessage(`Saved ${savedCount} flat bill${savedCount === 1 ? "" : "s"} for this billing period.`);
      if (skippedRowsMessage) setMonthlyError(skippedRowsMessage);
    } catch (error) {
      setMonthlyError(`Saved ${savedCount} of ${rowsToSave.length} flat bills. ${error.message} Saved rows are marked and will not be sent again.${skippedRowsMessage ? ` ${skippedRowsMessage}` : ""}`);
    } finally {
      setSavingMonthlyRows(false);
    }
  };

  const handleSave = async () => {
    if (!form.fromDate || !form.toDate || !form.billDate || !form.dueDate) {
      alert("Please select From Date, To Date, Bill Date, and Due Date.");
      return;
    }
    const payload = {
      flat: form.flat,
      meter: form.meter,
      grid: form.grid,
      gd: form.gd,
      arrears: form.arrears,
      load: form.load,
      charge: slabAmounts.chargeAmount,
      rateAmount: slabAmounts.rateAmount,
      dgCharge: dgAmount,
      fuelSearchCharge: fuelSearchCharges,
      ctDtRent,
      dutyCharge: dutyCharges,
      fixedCharge: fixedCharges,
      penalty: values.penalty,
      discount: values.discount,
      total,
      totalPaidAmount: total,
      customerName: form.customerName || "Customer " + (form.flat || "Walk-in"),
      address: flatOptions.find((flat) => flat.UnitNo === form.flat)?.address || "",
      fromDate: form.fromDate,
      toDate: form.toDate,
      billDate: form.billDate,
      dueDate: form.dueDate,
      status: editingStatus,
      createdBy: "admin",
    };

    try {
      const response = await fetch(editingBillId ? `/api/bills/${editingBillId}` : "/api/bills", {
        method: editingBillId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to save bill.");
      setForm(empty);
      setFlatOpen(false);
      setEditingBillId(null);
      setEditingStatus("Pending");
      setSaved(true);
    } catch (error) {
      alert(error.message || "Unable to save the bill.");
    }
  };

  return <div className="eb-admin-generate-bill">
    <div className="eb-generate-mode-tabs" role="tablist" aria-label="Bill generation mode">
      <button className={`eb-generate-mode-tab ${billMode === "single" ? "eb-generate-mode-tab-active" : ""}`} type="button" role="tab" aria-selected={billMode === "single"} onClick={() => setBillMode("single")}>Single Bill</button>
      <button className={`eb-generate-mode-tab ${billMode === "table" ? "eb-generate-mode-tab-active" : ""}`} type="button" role="tab" aria-selected={billMode === "table"} disabled={Boolean(editingBillId)} onClick={() => setBillMode("table")}><Table2 size={15} />Monthly Table</button>
    </div>
    {billMode === "table" && !editingBillId ? <section className="eb-admin-bill-form eb-monthly-bill-form">
      <div className="eb-admin-table-head"><div><h2>Generate bills for multiple flats</h2><p>Add one row per flat for the billing period. Successful rows stay saved if another row fails.</p></div><CalendarPlus size={20} /></div>
      <input ref={monthlyWorkbookRef} type="file" accept=".xls,.xlsx" hidden onChange={importMonthlyWorkbook} />
      <div className="eb-monthly-table-wrap"><table className="eb-monthly-table"><thead><tr><th>Flat / customer</th><th>Meter</th><th>Month</th><th>From</th><th>To</th><th>Bill date</th><th>Due date</th><th>Grid units</th><th>DG units</th><th>Arrears</th><th>Interest</th><th>Discount</th><th>Total (Rs.)</th><th>Status</th></tr></thead><tbody>
        {monthlyRows.map((row, index) => <tr key={row.id}>
          <td className="eb-monthly-flat-cell"><input aria-label={`Flat number, row ${index + 1}`} value={row.flat || row.flatSearch} placeholder="Search flat number" autoComplete="off" disabled={row.saved || savingMonthlyRows} role="combobox" aria-expanded={monthlyFlatRowId === row.id} aria-controls={`monthly-flat-options-${row.id}`} onFocus={() => { setMonthlyFlatRowId(row.id); setMonthlyFlatSearch(row.flatSearch || row.flat); }} onChange={(event) => searchMonthlyFlat(row, event.target.value)} />{(row.customerName || row.meter) && <small>{row.customerName || "Customer"} · Meter {row.meter || "not set"}</small>}
            {monthlyFlatRowId === row.id && !row.saved && !savingMonthlyRows && <div className="eb-flat-options" id={`monthly-flat-options-${row.id}`} role="listbox">
              {monthlyFlatLoading ? <div className="eb-flat-option-status">Loading flats...</div> : monthlyFlatOptions.length ? monthlyFlatOptionSections.map((section, sectionIndex) => <div className="eb-flat-option-section" key={`monthly-flat-section-${sectionIndex}`}><div className="eb-flat-option-section-title">Section {sectionIndex + 1} · {section.length} flats</div>{section.map((flat) => <button key={flat.AssignFlatID} type="button" role="option" aria-selected={row.flatId === flat.AssignFlatID} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMonthlyFlat(row.id, flat)}><strong>{flat.UnitNo}</strong>{getFlatField(flat, "customerName", "CustomerName") && <small>{getFlatField(flat, "customerName", "CustomerName")} · Meter {getFlatField(flat, "meter", "MeterNumber", "MeeterNumber") || "not set"}</small>}</button>)}</div>) : <div className="eb-flat-option-status">No matching flats found.</div>}
            </div>}
          </td>
          <td><input aria-label={`Meter number, row ${index + 1}`} type="text" value={row.meter} disabled={row.saved || savingMonthlyRows} onChange={(event) => updateMonthlyRow(row.id, "meter", event.target.value)} placeholder="Meter no." /></td>
          <td><strong>{row.fromDate ? new Date(`${row.fromDate}T00:00:00`).toLocaleDateString("en", { month: "short", year: "numeric" }) : "-"}</strong></td>
          {[["fromDate", "From date"], ["toDate", "To date"], ["billDate", "Bill date"], ["dueDate", "Due date"]].map(([field, label]) => <td key={field}><input aria-label={`${label}, row ${index + 1}`} type="date" value={row[field]} disabled={row.saved || savingMonthlyRows} onChange={(event) => updateMonthlyRow(row.id, field, event.target.value)} /></td>)}
          {[["grid", "Grid units"], ["gd", "DG units"], ["arrears", "Arrears"], ["penalty", "Interest"], ["discount", "Discount"]].map(([field, label]) => <td key={field}><input aria-label={`${label}, row ${index + 1}`} type="number" min="0" step="0.01" value={row[field]} disabled={row.saved || savingMonthlyRows} onChange={(event) => updateMonthlyRow(row.id, field, event.target.value)} /></td>)}
          <td><strong>Rs. {monthlyCalculations[index].total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
          <td>{row.saved ? <span className="eb-monthly-row-saved">Saved</span> : <button className="eb-admin-row-pdf eb-monthly-remove" type="button" title="Remove month" aria-label={`Remove month row ${index + 1}`} disabled={savingMonthlyRows || monthlyRows.length === 1} onClick={() => removeMonthlyRow(row.id)}><Trash2 size={14} /></button>}</td>
        </tr>)}
      </tbody></table></div>
      <div className="eb-monthly-table-footer"><div><strong>{monthlyRows.length}</strong> flat row{monthlyRows.length === 1 ? "" : "s"} · Grand total <strong>Rs. {monthlyCalculations.reduce((sum, row) => sum + row.total, 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div><div className="eb-admin-bill-actions"><button className="eb-btn eb-btn-light" type="button" disabled={savingMonthlyRows || importingMonthlyWorkbook} onClick={() => monthlyWorkbookRef.current?.click()}><Upload size={15} />{importingMonthlyWorkbook ? "Reading Excel..." : "Upload Excel"}</button><button className="eb-btn eb-btn-light" type="button" disabled={savingMonthlyRows || importingMonthlyWorkbook} onClick={addMonthlyRow}><CalendarPlus size={15} />Add flat</button><button className="eb-btn eb-btn-primary" type="button" disabled={savingMonthlyRows || importingMonthlyWorkbook || !monthlyRows.some((row) => !row.saved)} onClick={saveMonthlyBills}><Save size={15} />{savingMonthlyRows ? "Saving bills..." : "Save bills"}</button></div></div>
      {monthlyMessage && <div className="eb-admin-saved eb-monthly-feedback">{monthlyMessage}</div>}{monthlyError && <div className="eb-admin-user-message eb-admin-user-error eb-monthly-feedback">{monthlyError}</div>}
    </section> : <div className="eb-admin-bill-grid">
    <section className="eb-admin-bill-form">
      <div className="eb-admin-table-head"><div><h2>{editingBillId ? "Edit bill" : "Bill details"}</h2><p>{editingBillId ? "Update the selected bill and save it to the same record." : "Enter the client meter and consumption details."}</p></div><Calculator size={20} /></div>
      <div className="eb-admin-form-grid">
        <label className="eb-flat-picker" ref={flatPickerRef}>Flat number
          <input value={form.flat} onChange={set("flat")} onFocus={() => setFlatOpen(true)} placeholder="Type flat number, e.g. A" autoComplete="off" role="combobox" aria-expanded={flatOpen} aria-controls="flat-number-options" />
          {flatOpen && <div className="eb-flat-options" id="flat-number-options" role="listbox">
            {flatLoading ? <div className="eb-flat-option-status">Loading flats...</div> : flatOptions.length ? flatOptionSections.map((section, sectionIndex) => <div className="eb-flat-option-section" key={`flat-section-${sectionIndex}`}><div className="eb-flat-option-section-title">Section {sectionIndex + 1} · {section.length} flats</div>{section.map((flat) => <button key={flat.AssignFlatID} type="button" role="option" aria-selected={form.flat === flat.UnitNo} onMouseDown={(event) => event.preventDefault()} onClick={() => selectFlat(flat)}><strong>{flat.UnitNo}</strong>{flat.customerName && <small>{flat.customerName}</small>}</button>)}</div>) : <div className="eb-flat-option-status">No matching flat number found.</div>}
          </div>}
        </label>
        <label>Meter number<input value={form.meter} onChange={set("meter")} placeholder="e.g. 123456" /></label>
        <label>Customer name<input value={form.customerName} onChange={set("customerName")} placeholder="Select a flat to bind" /></label>
        <label>Load<input value={form.load} onChange={set("load")} placeholder="e.g. 12 KW" /></label>
        <label>From date<input type="date" value={form.fromDate} onChange={set("fromDate")} required /></label>
        <label>To date<input type="date" value={form.toDate} onChange={set("toDate")} required /></label>
        <label>Bill date<input type="date" value={form.billDate} onChange={set("billDate")} required /></label>
        <label>Due date<input type="date" value={form.dueDate} onChange={set("dueDate")} required /></label>
        <label>Grid units (kWh)<input type="number" value={form.grid} onChange={set("grid")} placeholder="e.g. 320" /></label>
        <label>DG units<input type="number" value={form.gd} onChange={set("gd")} placeholder="e.g. 45" /></label>
        <label>DG charge per unit (Rs.)<input type="number" value={form.dgCharge} readOnly /></label>
        <label>Arrears / previous balance (Rs.)<input type="number" value={form.arrears} readOnly placeholder="Select a flat to bind" /></label>
        <label>Interest on arrears (Rs.)<input type="number" min="0" step="0.01" value={form.penalty} onChange={set("penalty")} /></label>
        <label>Discount (Rs.)<input type="number" value={form.discount} onChange={set("discount")} /></label>
        <label><span className="eb-charge-label">Fuel Search Charges (Rs.)<button className="eb-charge-edit" type="button" onClick={() => openMasterEdit("Fuel Search Charges")}>Edit</button></span><input type="text" value={masterDisplayAmount("Fuel Search Charges")} readOnly /></label>
        <label><span className="eb-charge-label">CT/DT Rent (Rs.)<button className="eb-charge-edit" type="button" onClick={() => openMasterEdit("CT/DT Rent")}>Edit</button></span><input type="text" value={masterDisplayAmount("CT/DT Rent")} readOnly /></label>
        <label><span className="eb-charge-label">Duty (Rs.)<button className="eb-charge-edit" type="button" onClick={() => openMasterEdit("Duty")}>Edit</button></span><input type="text" value={masterDisplayAmount("Duty")} readOnly /></label>
      </div>
      <div className="eb-admin-bill-actions"><button className="eb-btn eb-btn-primary" type="button" onClick={handleSave}><Save size={16} />{editingBillId ? "Update bill" : "Save bill"}</button><button className="eb-btn eb-btn-light" type="button" onClick={() => { setForm(empty); setEditingBillId(null); setEditingStatus("Pending"); setSaved(false); }}><RotateCcw size={16} />Reset</button><button className="eb-btn eb-btn-light" type="button" onClick={() => window.print()}><Printer size={16} />Print</button></div>
      {saved && <div className="eb-admin-saved">Bill saved successfully for admin review.</div>}
    </section>
    <section className="eb-admin-bill-summary"><div className="eb-admin-table-head"><div><h2>Bill summary</h2><p>Live payable amount</p></div></div><div className="eb-admin-total-label">Final payable amount<strong>Rs. {total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></div><div className="eb-admin-summary-line"><span>Rate amount</span><strong>Rs. {slabAmounts.rateAmount.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>Charge amount</span><strong>Rs. {slabAmounts.chargeAmount.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>DG amount</span><strong>Rs. {dgAmount.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>Fuel Search Charges ({values.grid} × Rs. {masterAmount("Fuel Search Charges").toFixed(2)})</span><strong>Rs. {fuelSearchCharges.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>CT/DT Rent</span><strong>Rs. {ctDtRent.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>Duty ({values.grid} × Rs. {masterAmount("Duty").toFixed(2)})</span><strong>Rs. {dutyCharges.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>Fixed charges</span><strong>Rs. {fixedCharges.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>Previous balance</span><strong>Rs. {values.arrears.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>Interest on arrears</span><strong>Rs. {values.penalty.toFixed(2)}</strong></div><div className="eb-admin-summary-line"><span>Discount</span><strong>Rs. {values.discount.toFixed(2)}</strong></div></section>
    {editingMaster && <div className="eb-master-modal-backdrop" role="presentation" onMouseDown={closeMasterEdit}><div className="eb-master-modal" role="dialog" aria-modal="true" aria-labelledby="master-edit-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="master-edit-title">Edit {editingMaster.MasterType}</h2><p>Change the amount for this master.</p><label>Amount<input type="number" step="0.01" value={masterEditAmount} onChange={(event) => setMasterEditAmount(event.target.value)} autoFocus /></label><div className="eb-master-modal-actions"><button className="eb-btn eb-btn-light" type="button" onClick={closeMasterEdit} disabled={masterEditSaving}>Cancel</button><button className="eb-btn eb-btn-primary" type="button" onClick={saveMasterEdit} disabled={masterEditSaving}>{masterEditSaving ? "Saving..." : "Save"}</button></div></div></div>}
    </div>}
  </div>;
}

export default AdminGenerateBill;
