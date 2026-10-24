import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType, Printer, RefreshCw, Search, X } from "lucide-react";
import { jsPDF } from "jspdf";

const BILLING_ADDRESS = "Max Heiights Majestic, GH-III, Suncity Township, Village Nindar, Grand Sikar Road, Jaipur-302013";
const value = (bill, ...keys) => keys.map((key) => bill[key]).find((item) => item !== undefined && item !== null) ?? "";
const number = (input) => Number(input) || 0;
const firstAmount = (bill, ...keys) => {
  const amounts = keys.map((key) => number(bill[key]));
  return amounts.find((amount) => amount !== 0) ?? 0;
};
const money = (input) => `Rs. ${number(input).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (input) => input ? new Date(input).toLocaleDateString("en-IN") : "-";
const shortDateText = (input) => input ? new Date(input).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "-";
const escapeHtml = (input) => String(input ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const requestSaveLocation = (fileName, mimeType, extension, description) => {
  if (typeof window.showSaveFilePicker !== "function") return Promise.resolve(null);
  return window.showSaveFilePicker({
    suggestedName: fileName,
    types: [{ description, accept: { [mimeType]: [extension] } }],
  });
};
const saveExportFile = async (blob, fileName, mimeType, extension, description, fileHandle = null) => {
  if (!fileHandle && typeof window.showSaveFilePicker === "function") {
    fileHandle = await requestSaveLocation(fileName, mimeType, extension, description);
  }
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const billDisplayNo = (id, billDate) => { const date = billDate ? new Date(billDate) : new Date(); const year = date.getFullYear(); const startYear = date.getMonth() >= 3 ? year : year - 1; return `PSL | ${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)} | ${String(id ?? "").match(/^\d+$/) ? String(id).padStart(3, "0") : String(id ?? "-")}`; };

function mapBill(bill, billRates = {}) {
  const grid = number(value(bill, "Unit"));
  const gridCharge = firstAmount(bill, "RateAmount", "Charge");
  const dg = number(value(bill, "DGUnit"));
  const dgCharge = number(value(bill, "DGCharge", "DGAmount"));
  const fixed = firstAmount(bill, "FixedCharge", "MiscCharge") || 495;
  const masterAmount = (type) => number(billRates.masters?.find((master) => master.MasterType === type)?.Amount);
  const fuelRate = masterAmount("Fuel Search Charges");
  const dutyRate = masterAmount("Duty");
  const fuelSearchCharge = firstAmount(bill, "FuelSearchCharge", "FuelSurcharge", "FuelSearchCharges") || grid * fuelRate;
  const ctDtRent = firstAmount(bill, "CTDTRent", "CTDT", "CT/DT Rent", "CtDtRent", "CTDTAmount", "CtDtRentAmount", "CtdtRent") || masterAmount("CT/DT Rent");
  const duty = firstAmount(bill, "DutyCharge", "Duty", "ElectricityDuty") || grid * masterAmount("Duty");
  const arrears = number(value(bill, "PreviousBalance", "PriviousBalance"));
  const interest = number(value(bill, "penalty", "Penalty"));
  const savedOther = number(value(bill, "OtherCharge"));
  const total = firstAmount(bill, "TotalPaidAmount", "ChargeAmount");
  // Older records stored only the final total. Keep the printed charge rows reconciled.
  const other = savedOther || Math.max(0, total - gridCharge - dgCharge - fixed - ctDtRent - arrears - interest);
  const chargesTotal = Math.max(0, total - arrears);
  const billDate = value(bill, "BillDate");
  return {
    id: value(bill, "ID", "Id"), receipt: billDisplayNo(value(bill, "ReceiptID") || value(bill, "ID", "Id"), billDate),
    flat: value(bill, "UnitNo", "FlatNo", "FlatID"), customer: value(bill, "CustomerName") || "-", address: `${value(bill, "UnitNo", "FlatNo", "FlatID") || "-"}, ${BILLING_ADDRESS}`, meter: value(bill, "MeterNumber", "MeeterNumber") || "-",
    grid, gridCharge, dg, dgCharge, fixed, fuelRate, fuelSearchCharge, dutyRate, ctDtRent, duty, arrears, interest, other, chargesTotal, total,
    status: String(value(bill, "Status") || "Pending").trim(), billDate, dueDate: value(bill, "DueDate"),
    fromDate: value(bill, "FromDate"), toDate: value(bill, "ToDate"), remarks: value(bill, "Remarks")
  };
}

function createBillPdf(row) {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = 210, pageH = 297;
  const left = 10, right = 200, width = right - left;
  const navy = [24, 63, 103];
  const blue = [55, 105, 160];
  const lightBlue = [224, 236, 248];
  const veryLightBlue = [241, 247, 252];
  const border = [82, 123, 176];
  const text = [28, 39, 53];

  const setFont = (bold, size, color = text) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const rect = (x, y, w, h, fill, line = border, lineWidth = 0.35) => {
    pdf.setDrawColor(line[0], line[1], line[2]);
    pdf.setLineWidth(lineWidth);
    if (fill) {
      pdf.setFillColor(fill[0], fill[1], fill[2]);
      pdf.rect(x, y, w, h, "FD");
    } else {
      pdf.rect(x, y, w, h);
    }
  };

  const textFit = (value, x, y, maxW, size, bold = false, align = "left") => {
    const str = String(value ?? "-");
    setFont(bold, size);
    const lines = pdf.splitTextToSize(str, Math.max(8, maxW));
    const line = lines[0] || "-";
    pdf.text(line, align === "right" ? x + maxW : align === "center" ? x + maxW / 2 : x, y, { align });
  };

  const sectionTitle = (x, y, w, label) => {
    rect(x, y, w, 8, lightBlue, border, 0.35);
    setFont(true, 10.5, navy);
    pdf.text(label, x + 2.5, y + 5.6);
  };

  // Outer page frame
  rect(left, 8, width, 281, null, border, 0.75);

  // =========================
  // HEADER
  // =========================
  rect(left + 2, 10, width - 4, 17, lightBlue, border, 0.4);
  setFont(true, 17, navy);
  pdf.text("BILL OF SUPPLY FOR ELECTRICITY", pageW / 2, 21, { align: "center" });

  rect(left + 2, 29, width - 4, 27, veryLightBlue, border, 0.4);
  setFont(true, 14, navy);
  pdf.text("PAAS SIKAR LOGISTICS LLP", pageW / 2, 39, { align: "center" });
  setFont(false, 7.8, text);
  pdf.text(". Reg. office at GH-III, Suncity Township, Sikar Road, Jaipur-302013.", pageW / 2, 47, { align: "center" });
  pdf.text("Corp. office at A-17, Ground Floor, Pitampura, New Delhi-110034..", pageW / 2, 52, { align: "center" });

  // =========================
  // CUSTOMER / METER / BILL INFORMATION
  // =========================
  const infoY = 58;
  const rowH = 13;
  const addressRowH = 27;
  const infoH = rowH * 2 + addressRowH;
  const c1 = 78, c2 = 58, c3 = width - c1 - c2;
  rect(left + 2, infoY, width - 4, infoH, null, border, 0.4);
  const ix = left + 2;
  const iw = width - 4;
  pdf.line(ix + c1, infoY, ix + c1, infoY + infoH);
  pdf.line(ix + c1 + c2, infoY, ix + c1 + c2, infoY + infoH);
  pdf.line(ix, infoY + rowH, ix + iw, infoY + rowH);
  pdf.line(ix, infoY + rowH * 2, ix + iw, infoY + rowH * 2);

  const customerName = String(row.customer || "-").toUpperCase();
  const customerAddress = String(row.address || "Address not available");
  const meterNo = String(row.meter || "-");
  const billNo = String(row.receipt || row.id || "-");
  const billDate = dateText(row.billDate);
  const dueDate = dateText(row.dueDate);
  const periodText = `${shortDateText(row.fromDate)} to ${shortDateText(row.toDate)}`;

  const label = (txt, x, y) => { setFont(true, 7.9, navy); pdf.text(txt, x, y); };
  const val = (txt, x, y, maxW, align = "left") => { textFit(txt, x, y, maxW, 8.6, false, align); };

  label("Name:", ix + 3, infoY + 8.3);
  val(customerName, ix + 20, infoY + 8.3, c1 - 23);
  label("Meter No.:", ix + c1 + 3, infoY + 8.3);
  val(meterNo, ix + c1 + 27, infoY + 8.3, c2 - 30);
  label("Bill No.:", ix + c1 + c2 + 3, infoY + 8.3);
  val(billNo, ix + c1 + c2 + 22, infoY + 8.3, c3 - 25);

  label("So/WoDs.:", ix + 3, infoY + rowH + 8.3);
  val(customerName, ix + 25, infoY + rowH + 8.3, c1 - 28);
  label("Sanctioned Load:", ix + c1 + 3, infoY + rowH + 8.3);
  val("12 KW", ix + c1 + 38, infoY + rowH + 8.3, c2 - 41);
  label("Bill Date:", ix + c1 + c2 + 3, infoY + rowH + 8.3);
  val(billDate, ix + c1 + c2 + 22, infoY + rowH + 8.3, c3 - 25);

  label("Address:", ix + 3, infoY + rowH * 2 + 6.5);
  setFont(false, 8.6, text);
  pdf.text(pdf.splitTextToSize(customerAddress, c1 - 25).slice(0, 3), ix + 22, infoY + rowH * 2 + 6.5, { lineHeightFactor: 1.15 });
  label("Flat No:", ix + 3, infoY + rowH * 2 + 22);
  val(row.flat || "-", ix + 22, infoY + rowH * 2 + 22, c1 - 25);
  label("Bill Period:", ix + c1 + 3, infoY + rowH * 2 + 8.3);
  textFit(periodText, ix + c1 + 25, infoY + rowH * 2 + 8.3, c2 - 28, 7.8);
  label("Due Date:", ix + c1 + c2 + 3, infoY + rowH * 2 + 8.3);
  val(dueDate, ix + c1 + c2 + 22, infoY + rowH * 2 + 8.3, c3 - 25);

  // =========================
  // MAIN TWO-COLUMN AREA
  // =========================
  const mainTop = infoY + infoH + 4;
  const gap = 4;
  const colW = (width - 4 - gap) / 2;
  const leftX = left + 2;
  const rightX = leftX + colW + gap;
  const mainW = width - 4;

  // LEFT: Consumption
  sectionTitle(leftX, mainTop, colW, "CONSUMPTION DETAILS");
  const consY = mainTop + 8;
  const consH = 39;
  rect(leftX, consY, colW, consH, null, border, 0.35);
  const cw = [25, 25, 20, colW - 70];
  let cx = leftX;
  cw.forEach((w, i) => { if (i > 0) pdf.line(cx, consY, cx, consY + consH); cx += w; });

  // Header + current consumption row.
  pdf.line(leftX, consY + 7, leftX + colW, consY + 7);
  // Separate the first consumption row from the meter-reading row.
  pdf.line(leftX, consY + 17, leftX + colW, consY + 17);

  setFont(true, 7.0, navy);
  pdf.text("From", leftX + cw[0] / 2, consY + 5, { align: "center" });
  pdf.text("To", leftX + cw[0] + cw[1] / 2, consY + 5, { align: "center" });
  pdf.text("Units", leftX + cw[0] + cw[1] + cw[2] / 2, consY + 5, { align: "center" });
  pdf.text("Amount", leftX + colW - cw[3] / 2, consY + 5, { align: "center" });

  setFont(false, 7.0, text);
  pdf.text(shortDateText(row.fromDate), leftX + cw[0] / 2, consY + 13, { align: "center" });
  pdf.text(shortDateText(row.toDate), leftX + cw[0] + cw[1] / 2, consY + 13, { align: "center" });
  pdf.text(String(row.grid || 0), leftX + cw[0] + cw[1] + cw[2] / 2, consY + 13, { align: "center" });
  pdf.text(money(row.gridCharge), leftX + colW - 2, consY + 13, { align: "right" });

  // Meter readings stay completely inside the consumption box.
  setFont(false, 6.8, text);
  pdf.text("DG Unit", leftX + cw[0] / 2, consY + 23, { align: "center" });
  pdf.text("DG Rate", leftX + cw[0] + cw[1] / 2, consY + 23, { align: "center" });
  pdf.text("Units", leftX + cw[0] + cw[1] + cw[2] / 2, consY + 23, { align: "center" });
  pdf.text("Amount", leftX + colW - cw[3] / 2, consY + 23, { align: "center" });

  setFont(true, 7.2, navy);
  pdf.text(String(row.dg || 0), leftX + cw[0] / 2, consY + 33, { align: "center" });
  pdf.text("Rs. 26", leftX + cw[0] + cw[1] / 2, consY + 33, { align: "center" });
  pdf.text(String(row.dg || 0), leftX + cw[0] + cw[1] + cw[2] / 2, consY + 33, { align: "center" });
  pdf.text(money(row.dgCharge), leftX + colW - 2, consY + 33, { align: "right" });

  // LEFT: Energy charge slab rates
  const energyY = consY + consH + 4;
  sectionTitle(leftX, energyY, colW, "ENERGY CHARGES DETAIL");
  const rateY = energyY + 8;
  const rateH = 30;
  rect(leftX, rateY, colW, rateH, null, border, 0.35);
  const rateSplit = 62;
  pdf.line(leftX + rateSplit, rateY, leftX + rateSplit, rateY + rateH);
  pdf.line(leftX, rateY + 6, leftX + colW, rateY + 6);
  setFont(true, 7.0, navy);
  pdf.text("Unit slab", leftX + 3, rateY + 4.3);
  pdf.text("Rate", leftX + rateSplit + 5, rateY + 4.3);
  const tariffRows = [
    ["0 - 50 units", "Rs. 4.75 / unit"],
    ["51 - 150 units", "Rs. 6.00 / unit"],
    ["151 - 500 units", "Rs. 7.00 / unit"],
    ["Above 500 units", "Rs. 7.50 / unit"]
  ];
  setFont(false, 6.9, text);
  tariffRows.forEach((item, idx) => {
    const y = rateY + 6 + idx * 6;
    if (idx > 0) pdf.line(leftX, y, leftX + colW, y);
    pdf.text(item[0], leftX + 3, y + 4.2);
    pdf.text(item[1], leftX + rateSplit + 5, y + 4.2);
  });

  // RIGHT: Billing details
  sectionTitle(rightX, mainTop, colW, "BILLING DETAILS");
  const billY = mainTop + 8;
  const billH = 67;
  rect(rightX, billY, colW, billH, null, border, 0.35);
  setFont(true, 8, navy);
  pdf.text("Due Date:", rightX + 3, billY + 6);
  pdf.text(dateText(row.dueDate), rightX + 30, billY + 6);

  const headerY = billY + 8;
  const noW = 11, descW = 62, amtW = colW - noW - descW;
  pdf.line(rightX, headerY, rightX + colW, headerY);
  pdf.line(rightX, headerY + 7, rightX + colW, headerY + 7);
  pdf.line(rightX + noW, headerY, rightX + noW, headerY + 40);
  pdf.line(rightX + noW + descW, headerY, rightX + noW + descW, headerY + 40);
  setFont(true, 6.8, navy);
  pdf.text("No.", rightX + noW / 2, headerY + 4.8, { align: "center" });
  pdf.text("Description", rightX + noW + descW / 2, headerY + 4.8, { align: "center" });
  pdf.text("Amount", rightX + noW + descW + amtW / 2, headerY + 4.8, { align: "center" });

  const billingRows = [
    ["1", "Electricity charges", row.gridCharge],
    ["2", `DG Charges @ 26/Unit (${row.dg} units)`, row.dgCharge],
    ["3", "Fixed charges", row.fixed],
    ["4", `Fuel surcharge/Regulatory surcharge (${row.grid} × Rs. ${row.fuelRate.toFixed(2)})`, row.fuelSearchCharge],
    ["5", "CT/PT Rent", row.ctDtRent],
    ["6", `Electricity Duty (${row.grid} × Rs. ${row.dutyRate.toFixed(2)})`, row.duty],
  ];
  setFont(false, 6.7, text);
  billingRows.forEach((item, idx) => {
    const y = headerY + 7 + idx * 5.5;
    if (idx > 0) pdf.line(rightX, y, rightX + colW, y);
    pdf.text(item[0], rightX + noW / 2, y + 4.0, { align: "center" });
    const descLines = pdf.splitTextToSize(item[1], descW - 4);
    pdf.text(descLines[0], rightX + noW + 2, y + 4.0);
    pdf.text(item[2] ? money(item[2]) : "NIL", rightX + colW - 2, y + 4.0, { align: "right" });
  });

  const totalsY = headerY + 40;
  pdf.line(rightX, totalsY, rightX + colW, totalsY);
  pdf.setFillColor(239, 246, 250);
  pdf.rect(rightX, totalsY, colW, 18, "F");
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.rect(rightX, totalsY, colW, 18);
  setFont(true, 8.2, navy);
  pdf.text("Total amount", rightX + 3, totalsY + 5);
  pdf.text(money(row.chargesTotal), rightX + colW - 3, totalsY + 5, { align: "right" });
  pdf.text("Arrears", rightX + 3, totalsY + 11);
  pdf.text(row.arrears ? money(row.arrears) : "NIL", rightX + colW - 3, totalsY + 11, { align: "right" });
  pdf.text("Interest on arrears", rightX + 3, totalsY + 17);
  pdf.text(row.interest ? money(row.interest) : "NIL", rightX + colW - 3, totalsY + 17, { align: "right" });

  // =========================
  // TOTAL / PAYMENT FOOTER
  // =========================
  // Calculate the bottom of both columns first so the total bar can never
  // overlap the Energy Charges or Billing Details sections.
  const leftColumnBottom = rateY + rateH;
  const rightColumnBottom = billY + billH;
  const mainContentBottom = Math.max(leftColumnBottom, rightColumnBottom);

  const totalBarY = mainContentBottom + 4;
  rect(left + 2, totalBarY, mainW, 12, blue, blue, 0.4);
  setFont(true, 12.5, [255, 255, 255]);
  pdf.text("TOTAL PAYABLE AMOUNT", left + 6, totalBarY + 8);
  pdf.text(money(row.total), right - 5, totalBarY + 8, { align: "right" });

  const dueY = totalBarY + 15;
  rect(left + 2, dueY, mainW, 9, veryLightBlue, border, 0.4);
  setFont(true, 8.1, navy);
  pdf.text("TOTAL PAYABLE AFTER DUE DATE :", left + 5, dueY + 6);
  pdf.text(money(row.total), right - 5, dueY + 6, { align: "right" });

  // Payment note sits immediately below the due-date box.
  const payNoteY = dueY + 12;
  setFont(false, 6.2, [60, 70, 82]);
  pdf.text("Please pay on or before the due date. This is a computer-generated bill and does not require a signature.", left + 3, payNoteY);

  // =========================
  // IMPORTANT NOTES - COMPACT, BILL-COMPATIBLE STYLE
  // =========================
  const importantNotesY = payNoteY + 4;
  const notesH = 43;
  rect(left + 2, importantNotesY, mainW, notesH, veryLightBlue, border, 0.45);

  // Notes header uses the same light-blue style as the other bill sections.
  pdf.setFillColor(lightBlue[0], lightBlue[1], lightBlue[2]);
  pdf.rect(left + 2, importantNotesY, mainW, 7, "F");
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.line(left + 2, importantNotesY + 7, right - 2, importantNotesY + 7);
  setFont(true, 9.2, navy);
  pdf.text("IMPORTANT NOTES", pageW / 2, importantNotesY + 5, { align: "center" });

  const noteLines = [
    "* Payment can be made either by cheque/DD/RTGS/UPI.",
    "* Cheque or DD should be issued in favour of PAAS SIKAR LOGISTICS LLP.",
    "* Bank details - State Bank of India A/c - 41281118879, IFSC - SBIN0002123, Branch - Sector-7 Rohini, Delhi",
    "* Tax applicable as per Government norms (From 1st July onwards GST @ 18%).",
    "* Interest will be charged @ 18% p.a on all delayed payments",
    "* Please mention Tower & Flat no. & Contact no. on back side of cheque before depositing",
    "* In case of dishonour of cheque re-payment will only be accepted through D.D. & Bank charges @ Rs. 250/- per cheque",
    "* Please note If you don't make bill payment as per the due date your electricity supply will be liable for disconnection after expiry of 15 days from the due date.",
    "* Please note, it is billed purely as service to the buyer without prejudice to contractual liability of the buyer.",
    "* The Electricity supply is purely for residential purpose only."
  ];

  setFont(false, 6.0, [40, 50, 62]);
  noteLines.forEach((line, index) => {
    const y = importantNotesY + 10 + index * 3.2;
    const wrapped = pdf.splitTextToSize(line, mainW - 8);
    // Keep the notes within the fixed box and A4 frame.
    pdf.text(wrapped[0] || line, left + 4, y);
  });

  return pdf;
}

function AdminBills() {
  const [bills, setBills] = useState([]); const [billRates, setBillRates] = useState({}); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [search, setSearch] = useState("");
  const [previewRow, setPreviewRow] = useState(null); const [previewUrl, setPreviewUrl] = useState(""); const [exportError, setExportError] = useState("");
  const loadBills = async () => { setLoading(true); setError(""); try { const [billsResponse, ratesResponse] = await Promise.all([fetch("/api/bills"), fetch("/api/bill-rates")]); const data = await billsResponse.json(); if (!billsResponse.ok) throw new Error(data.message || "Unable to load bills."); setBills(data); if (ratesResponse.ok) setBillRates(await ratesResponse.json()); } catch (loadError) { setError(loadError.message); } finally { setLoading(false); } };
  useEffect(() => { loadBills(); }, []);
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  useEffect(() => {
    if (!previewRow) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setPreviewRow(null);
        setPreviewUrl("");
        setExportError("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewRow]);
  const rows = bills.map((bill) => mapBill(bill, billRates));
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = normalizedSearch ? rows.filter((row) => [row.receipt, row.flat, String(row.total), money(row.total)].some((item) => String(item).toLowerCase().includes(normalizedSearch))) : rows;
  const downloadExcel = () => { const headers = ["Bill No", "Flat No", "Customer Name", "Meter Number", "Units", "Amount", "Status", "Bill Date"]; const csv = "\ufeff" + [headers, ...filteredRows.map((row) => [row.receipt, row.flat, row.customer, row.meter, row.grid, row.total, row.status, dateText(row.billDate)])].map((items) => items.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(",")).join("\r\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `powerpay-bills-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); };
  const printPdf = () => { const printWindow = window.open("", "_blank", "width=1100,height=800"); if (!printWindow) return; const body = filteredRows.map((row) => `<tr><td>${escapeHtml(row.receipt)}</td><td>${escapeHtml(row.flat)}</td><td>${escapeHtml(row.customer)}</td><td>${escapeHtml(row.meter)}</td><td>${row.grid}</td><td>${money(row.total)}</td><td>${escapeHtml(row.status)}</td><td>${dateText(row.billDate)}</td></tr>`).join(""); printWindow.document.write(`<html><head><title>PowerPay Bills</title><style>body{font-family:Arial;color:#17233b;padding:24px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:9px;border:1px solid #d9e1ec;text-align:left}th{background:#edf4ff}@media print{body{padding:0}}</style></head><body><h1>PowerPay Bill Report</h1><p>Generated on ${new Date().toLocaleString("en-IN")}</p><table><thead><tr><th>Bill No</th><th>Flat No</th><th>Customer</th><th>Meter</th><th>Units</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`); printWindow.document.close(); };
  const printSingleBill = (row) => { const url = createBillPdf(row).output("bloburl"); const printWindow = window.open(url, "_blank"); if (printWindow) printWindow.onload = () => printWindow.print(); };
  const fileNameForBill = (row, extension) => `powerpay-bill-${String(row.receipt || row.id || "bill").replace(/[<>:"/\\|?*\s]+/g, "-")}.${extension}`;
  const openBillPreview = (row) => {
    setExportError("");
    try {
      setPreviewUrl(URL.createObjectURL(createBillPdf(row).output("blob")));
      setPreviewRow(row);
    } catch (previewError) {
      setExportError(previewError.message || "Unable to preview this bill.");
    }
  };
  const closeBillPreview = () => {
    setPreviewRow(null);
    setPreviewUrl("");
    setExportError("");
  };
  const downloadBillPdf = async () => {
    try {
      const fileName = fileNameForBill(previewRow, "pdf");
      const blob = createBillPdf(previewRow).output("blob");
      await saveExportFile(blob, fileName, "application/pdf", ".pdf", "PDF document");
      setExportError("");
    } catch (downloadError) {
      if (downloadError.name !== "AbortError") setExportError(downloadError.message || "Unable to export this bill to PDF.");
    }
  };
  const downloadBillExcel = async () => {
    try {
      const fileName = fileNameForBill(previewRow, "xlsx");
      const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const saveHandle = await requestSaveLocation(fileName, mimeType, ".xlsx", "Excel workbook");
      const spreadsheet = await import("@e965/xlsx");
      const sheet = spreadsheet.utils.aoa_to_sheet([
        ["Bill No", "Flat No", "Customer Name", "Address", "Meter Number", "From Date", "To Date", "Bill Date", "Due Date", "Units", "Electricity Charges", "DG Units", "DG Charges", "Fixed Charges", "Fuel Surcharge", "CT/PT Rent", "Electricity Duty", "Arrears", "Interest", "Other Charges", "Total Amount", "Status"],
        [previewRow.receipt, previewRow.flat, previewRow.customer, previewRow.address, previewRow.meter, dateText(previewRow.fromDate), dateText(previewRow.toDate), dateText(previewRow.billDate), dateText(previewRow.dueDate), previewRow.grid, previewRow.gridCharge, previewRow.dg, previewRow.dgCharge, previewRow.fixed, previewRow.fuelSearchCharge, previewRow.ctDtRent, previewRow.duty, previewRow.arrears, previewRow.interest, previewRow.other, previewRow.total, previewRow.status],
      ]);
      const workbook = spreadsheet.utils.book_new();
      spreadsheet.utils.book_append_sheet(workbook, sheet, "Bill");
      const fileData = spreadsheet.write(workbook, { bookType: "xlsx", type: "array" });
      await saveExportFile(new Blob([fileData], { type: mimeType }), fileName, mimeType, ".xlsx", "Excel workbook", saveHandle);
      setExportError("");
    } catch (downloadError) {
      if (downloadError.name !== "AbortError") setExportError(downloadError.message || "Unable to export this bill to Excel.");
    }
  };
  const downloadBillWord = async () => {
    try {
      const fields = [
        ["Bill No", previewRow.receipt], ["Flat No", previewRow.flat], ["Customer Name", previewRow.customer],
        ["Address", previewRow.address], ["Meter Number", previewRow.meter], ["From Date", dateText(previewRow.fromDate)],
        ["To Date", dateText(previewRow.toDate)], ["Bill Date", dateText(previewRow.billDate)], ["Due Date", dateText(previewRow.dueDate)],
        ["Units", previewRow.grid], ["Electricity Charges", money(previewRow.gridCharge)], ["DG Charges", money(previewRow.dgCharge)],
        ["Fixed Charges", money(previewRow.fixed)], ["Fuel Surcharge", money(previewRow.fuelSearchCharge)], ["CT/PT Rent", money(previewRow.ctDtRent)],
        ["Electricity Duty", money(previewRow.duty)], ["Arrears", money(previewRow.arrears)], ["Interest", money(previewRow.interest)],
        ["Other Charges", money(previewRow.other)], ["Total Amount", money(previewRow.total)], ["Status", previewRow.status],
      ];
      const tableRows = fields.map(([label, fieldValue]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(fieldValue)}</td></tr>`).join("");
      const documentHtml = `<html><head><meta charset="utf-8"><title>${escapeHtml(previewRow.receipt)}</title></head><body><h1>Electricity Bill</h1><table border="1" cellspacing="0" cellpadding="6">${tableRows}</table></body></html>`;
      const mimeType = "application/msword";
      await saveExportFile(new Blob([documentHtml], { type: `${mimeType};charset=utf-8` }), fileNameForBill(previewRow, "doc"), mimeType, ".doc", "Word document");
      setExportError("");
    } catch (downloadError) {
      if (downloadError.name !== "AbortError") setExportError(downloadError.message || "Unable to export this bill to Word.");
    }
  };
  return <div className="eb-admin-bills"><section className="eb-admin-table"><div className="eb-admin-table-head eb-admin-bills-head"><div><h2>Generated bills</h2><p>{bills.length} bill{bills.length === 1 ? "" : "s"} </p></div><div className="eb-admin-bill-tools"><label className="eb-admin-bill-search"><Search size={15} /><input type="search" aria-label="Search bills by bill number, flat number, or amount" placeholder="Search bill no, flat no, amount..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="eb-btn eb-btn-light" type="button" onClick={loadBills} title="Refresh bills"><RefreshCw size={15} />Refresh</button><button className="eb-btn eb-btn-light" type="button" onClick={downloadExcel} disabled={!filteredRows.length}><FileSpreadsheet size={15} />Excel</button><button className="eb-btn eb-btn-primary" type="button" onClick={printPdf} disabled={!filteredRows.length}><Printer size={15} />PDF</button></div></div>{loading ? <div className="eb-admin-user-state">Loading bills...</div> : error ? <div className="eb-admin-user-state eb-admin-user-error">{error}</div> : filteredRows.length ? <div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table"><thead><tr><th>Bill No</th><th>Flat No</th><th>Customer</th><th>Meter</th><th>Units</th><th>Amount</th><th>Status</th><th>Bill date</th><th>PDF</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}><td><span className="eb-admin-bill-id"><FileText size={14} />{row.receipt}</span></td><td>{row.flat}</td><td>{row.customer}</td><td>{row.meter}</td><td>{row.grid}</td><td>{money(row.total)}</td><td><span className="eb-admin-status">{row.status}</span></td><td>{dateText(row.billDate)}</td><td><span className="eb-admin-row-actions"><button className="eb-admin-row-pdf" type="button" onClick={() => printSingleBill(row)} title={`Print bill ${row.receipt}`}><Printer size={15} /></button><button className="eb-admin-row-pdf" type="button" onClick={() => openBillPreview(row)} title={`Preview and export bill ${row.receipt}`}><Download size={15} /></button></span></td></tr>)}</tbody></table></div> : <div className="eb-admin-user-state"><Download size={20} />{normalizedSearch ? "No bills match your search." : "No generated bills found."}</div>}</section>
    {previewRow && <div className="eb-bill-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBillPreview(); }}>
      <section className="eb-bill-preview" role="dialog" aria-modal="true" aria-labelledby="eb-bill-preview-title">
        <header className="eb-bill-preview-toolbar">
          <div><h2 id="eb-bill-preview-title">Bill preview</h2><p>{previewRow.receipt}</p></div>
          <div className="eb-bill-preview-actions">
            <button className="eb-btn eb-btn-light" type="button" onClick={downloadBillPdf}><FileText size={15} />PDF</button>
            <button className="eb-btn eb-btn-light" type="button" onClick={downloadBillExcel}><FileSpreadsheet size={15} />Excel</button>
            <button className="eb-btn eb-btn-light" type="button" onClick={downloadBillWord}><FileType size={15} />Word</button>
            <button className="eb-btn eb-btn-primary" type="button" onClick={() => { const printWindow = window.open(previewUrl, "_blank"); if (printWindow) printWindow.onload = () => printWindow.print(); }}><Printer size={15} />Print</button>
            <button className="eb-bill-preview-close" type="button" onClick={closeBillPreview} aria-label="Close bill preview"><X size={19} /></button>
          </div>
        </header>
        {exportError && <div className="eb-bill-preview-error" role="alert">{exportError}</div>}
        <iframe className="eb-bill-preview-frame" title={`Preview of bill ${previewRow.receipt}`} src={previewUrl} />
      </section>
    </div>}
  </div>;
}
export default AdminBills;