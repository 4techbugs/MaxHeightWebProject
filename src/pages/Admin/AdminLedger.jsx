import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Download, RefreshCw, Search } from "lucide-react";

const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateValue = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "-";
const billColumns = [
  ["Flat", "UnitNo"], ["Customer", "CustomerName"], ["Bill No", "ReceiptID"],
  ["Bill date", "BillDate"], ["Due date", "DueDate"],
  ["From date", "FromDate"], ["To date", "ToDate"], ["Meter", "MeterNumber"],
  ["Units", "Unit"], ["Rate amount", "RateAmount"], ["Other charges", "Charge"],
  ["Charge amount", "ChargeAmount"], ["Bill amount", "TotalPaidAmount"], ["DG units", "DGUnit"], ["DG charge", "DGCharge"],
  ["DG amount", "DGAmount"], ["Previous balance", "PreviousBalance"],
  ["Bill penalty", "BillPenalty"], ["Discount", "Discount"],
  ["Fuel search charge", "FuelSearchCharge"], ["CT/DT rent", "CTDTRent"],
  ["Duty charge", "DutyCharge"], ["Fixed charge", "FixedCharge"],
  ["Other charge", "OtherCharge"], ["Load", "Load"], ["Address", "Address"],
  ["Remarks", "Remarks"], ["Status", "Status"],
];
const paymentColumns = [
  ["Flat", "UnitNo"], ["Customer", "CustomerName"], ["Payment ID", "ID"],
  ["Receipt date", "ReceiptDate"], ["Amount", "Amount"], ["Payment mode", "PaymentMode"],
  ["Bank", "Bank"], ["Branch", "Branch"], ["Cheque / reference number", "ChequeNo"],
  ["Cheque date", "ChequeDate"],
];

const ledgerFlatKey = (record) => String(record.FlatID ?? record.UnitNo ?? record.CustomerID ?? record.CustomerName ?? "unknown");

const summarizeRecords = (records, amountField, dateField, billSummary = false) => {
  const summaries = new Map();
  records.forEach((record) => {
    const key = String(record.FlatID ?? record.UnitNo ?? record.CustomerID ?? record.CustomerName ?? "unknown");
    const summary = summaries.get(key) || {
      CustomerID: record.CustomerID,
      UnitNos: new Set(),
      CustomerName: record.CustomerName || "-",
      RecordCount: 0,
      Total: 0,
      Penalty: 0,
      PreviousBalance: 0,
      Discount: 0,
      RateAmount: 0,
      Charges: 0,
      LastDate: "",
    };
    if (record.UnitNo) summary.UnitNos.add(String(record.UnitNo));
    if (summary.CustomerName === "-" && record.CustomerName) summary.CustomerName = record.CustomerName;
    summary.RecordCount += 1;
    summary.Total += Number(record[amountField] || 0);
    if (billSummary) {
      summary.Penalty += Number(record.BillPenalty || 0);
      summary.PreviousBalance += Number(record.PreviousBalance || 0);
      summary.Discount += Number(record.Discount || 0);
      summary.RateAmount += Number(record.RateAmount || 0);
      summary.Charges += Number(record.Charge || 0) + Number(record.DGAmount || 0)
        + Number(record.FuelSearchCharge || 0) + Number(record.CTDTRent || 0)
        + Number(record.DutyCharge || 0) + Number(record.FixedCharge || 0)
        + Number(record.OtherCharge || 0);
    }
    if (record[dateField] && (!summary.LastDate || new Date(record[dateField]) > new Date(summary.LastDate))) {
      summary.LastDate = record[dateField];
    }
    summaries.set(key, summary);
  });
  summaries.forEach((summary) => {
    summary.UnitNo = [...summary.UnitNos].join(", ") || "-";
    delete summary.UnitNos;
  });
  return [...summaries.values()].sort((first, second) => String(first.UnitNo).localeCompare(String(second.UnitNo), undefined, { numeric: true }));
};

const summarizeFlatActivity = (bills, payments) => {
  const summaries = new Map();
  const getSummary = (record) => {
    const key = ledgerFlatKey(record);
    if (!summaries.has(key)) {
      summaries.set(key, {
        FlatID: record.FlatID,
        UnitNo: record.UnitNo || "-",
        CustomerName: record.CustomerName || "-",
        BillCount: 0,
        BillAmount: 0,
        PaymentCount: 0,
        PaymentAmount: 0,
        PaymentAmountForBalance: 0,
        OpeningBalance: 0,
        OpeningDate: "",
      });
    }
    return summaries.get(key);
  };
  bills.forEach((bill) => {
    const summary = getSummary(bill);
    summary.BillCount += 1;
    const previousBalance = Number(bill.PreviousBalance || 0);
    const billAmount = Number(bill.TotalPaidAmount || bill.ChargeAmount || 0);
    const currentCharges = billAmount - previousBalance;
    summary.BillAmount += currentCharges;
    const billDate = bill.BillDate ? new Date(bill.BillDate) : null;
    const openingDate = summary.OpeningDate ? new Date(summary.OpeningDate) : null;
    if (billDate && !Number.isNaN(billDate.getTime())
      && (!openingDate || billDate < openingDate
        || (billDate.getTime() === openingDate.getTime() && Number(bill.ID) < Number(summary.OpeningBillID)))) {
      summary.OpeningBalance = previousBalance;
      summary.OpeningDate = bill.BillDate;
      summary.OpeningBillID = bill.ID;
    }
  });
  payments.forEach((payment) => {
    const summary = getSummary(payment);
    const amount = Number(payment.Amount || 0);
    const openingDate = summary.OpeningDate ? new Date(summary.OpeningDate) : null;
    const receiptDate = payment.ReceiptDate ? new Date(payment.ReceiptDate) : null;
    if (!openingDate || !receiptDate || Number.isNaN(receiptDate.getTime()) || receiptDate >= openingDate) {
      summary.PaymentCount += 1;
      summary.PaymentAmount += amount;
      summary.PaymentAmountForBalance += amount;
    }
  });
  summaries.forEach((summary) => {
    summary.ClosingBalance = summary.OpeningBalance + summary.BillAmount - summary.PaymentAmountForBalance;
    delete summary.PaymentAmountForBalance;
    delete summary.OpeningBillID;
  });
  return [...summaries.values()].sort((first, second) =>
    String(first.UnitNo).localeCompare(String(second.UnitNo), undefined, { numeric: true }));
};

const createActivityRows = (bills, payments, summaries) => {
  const openingDates = new Map(summaries.map((summary) => [
    ledgerFlatKey(summary),
    summary.OpeningDate ? new Date(summary.OpeningDate) : null,
  ]));
  const paymentRows = payments
    .filter((payment) => {
      const openingDate = openingDates.get(ledgerFlatKey(payment));
      const receiptDate = payment.ReceiptDate ? new Date(payment.ReceiptDate) : null;
      return !openingDate || !receiptDate || Number.isNaN(receiptDate.getTime()) || receiptDate >= openingDate;
    })
    .map((payment) => ({
      Date: payment.ReceiptDate,
      UnitNo: payment.UnitNo || "-",
      Particulars: "Payment received",
      PaymentMode: payment.PaymentMode || "-",
      BillNo: "-",
      Debit: 0,
      Credit: Number(payment.Amount || 0),
    }));
  const billRows = bills.map((bill) => ({
    Date: bill.BillDate,
    UnitNo: bill.UnitNo || "-",
    Particulars: "Electricity bill",
    PaymentMode: "-",
    BillNo: bill.ReceiptID || bill.ID || "-",
    Debit: Number(bill.TotalPaidAmount || bill.ChargeAmount || 0) - Number(bill.PreviousBalance || 0),
    Credit: 0,
  }));
  const openingRows = summaries.map((summary) => ({
    Date: null,
    UnitNo: summary.UnitNo,
    Particulars: "Opening Balance",
    PaymentMode: "-",
    BillNo: "-",
    Debit: summary.OpeningBalance > 0 ? summary.OpeningBalance : 0,
    Credit: summary.OpeningBalance < 0 ? Math.abs(summary.OpeningBalance) : 0,
  }));
  const closingRows = summaries.map((summary) => ({
    Date: null,
    UnitNo: summary.UnitNo,
    Particulars: "Closing Balance",
    PaymentMode: "-",
    BillNo: "-",
    Debit: summary.ClosingBalance > 0 ? summary.ClosingBalance : 0,
    Credit: summary.ClosingBalance < 0 ? Math.abs(summary.ClosingBalance) : 0,
  }));
  const transactionRows = [...billRows, ...paymentRows]
    .sort((first, second) => new Date(second.Date || 0) - new Date(first.Date || 0));
  return [...openingRows, ...transactionRows, ...closingRows];
};

const matchesLedgerFilters = (record, query, status, accountStatuses) => {
  const text = `${record.UnitNo || ""} ${record.FlatID || ""} ${record.CustomerName || ""} ${record.MeterNumber || ""}`.toLowerCase();
  const recordStatus = String(accountStatuses.get(String(record.FlatID)) || record.Status || "Pending").trim();
  return (!query || text.includes(query.trim().toLowerCase())) && (status === "All" || recordStatus === status);
};

function AdminLedger() {
  const [ledger, setLedger] = useState({ accounts: [], bills: [], payments: [] });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);

  const loadLedger = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ledger");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load ledger.");
      setLedger({
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        bills: Array.isArray(data.bills) ? data.bills : [],
        payments: Array.isArray(data.payments) ? data.payments : [],
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLedger(); }, []);

  const accountStatuses = useMemo(() => new Map(ledger.accounts.map((account) => [
    String(account.FlatID),
    String(account.LastStatus || "Pending").trim(),
  ])), [ledger.accounts]);
  const visibleBills = useMemo(() => ledger.bills.filter((record) => matchesLedgerFilters(record, query, status, accountStatuses)), [ledger.bills, query, status, accountStatuses]);
  const visiblePayments = useMemo(() => ledger.payments.filter((record) => matchesLedgerFilters(record, query, status, accountStatuses)), [ledger.payments, query, status, accountStatuses]);
  const billSummaries = useMemo(() => summarizeRecords(visibleBills, "TotalPaidAmount", "BillDate", true), [visibleBills]);
  const paymentSummaries = useMemo(() => summarizeRecords(visiblePayments, "Amount", "ReceiptDate"), [visiblePayments]);
  const flatActivitySummaries = useMemo(() => summarizeFlatActivity(visibleBills, visiblePayments), [visibleBills, visiblePayments]);
  const activityRows = useMemo(() => createActivityRows(visibleBills, visiblePayments, flatActivitySummaries), [visibleBills, visiblePayments, flatActivitySummaries]);
  const totals = ledger.accounts.reduce((sum, row) => ({
    penalty: sum.penalty + Number(row.BillPenalty || 0) + Number(row.LatePenalty || 0),
    paid: sum.paid + Number(row.PaidAmount || 0),
    outstanding: sum.outstanding + Number(row.BilledTotal || 0) + Number(row.LatePenalty || 0) - Number(row.PaidAmount || 0),
  }), { penalty: 0, paid: 0, outstanding: 0 });
  totals.totalBilledAmount = ledger.bills.reduce((sum, bill) => sum + Number(bill.TotalPaidAmount || bill.ChargeAmount || 0), 0);

  const exportWorkbook = async (kind, records, summaries) => {
    const isBills = kind === "bills";
    const columns = isBills ? billColumns : paymentColumns;
    setExporting(true);
    setExportError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const summarySheet = workbook.addWorksheet("Customer Summary");
      summarySheet.columns = [
        { header: "Flat", key: "unit", width: 16 },
        { header: "Customer", key: "customer", width: 28 },
        { header: isBills ? "Bill count" : "Payment count", key: "count", width: 16 },
        { header: isBills ? "Bill amount" : "Total paid", key: "total", width: 20 },
        ...(isBills ? [
          { header: "Bill penalty", key: "penalty", width: 16 },
          { header: "Previous balance", key: "previousBalance", width: 18 },
          { header: "Discount", key: "discount", width: 16 },
          { header: "Rate charges", key: "rateAmount", width: 16 },
          { header: "Other charges", key: "charges", width: 16 },
        ] : []),
        { header: "Latest date", key: "lastDate", width: 16 },
      ];
      summarySheet.addRows(summaries.map((row) => ({
        unit: row.UnitNo,
        customer: row.CustomerName,
        count: row.RecordCount,
        total: row.Total,
        penalty: row.Penalty,
        previousBalance: row.PreviousBalance,
        discount: row.Discount,
        rateAmount: row.RateAmount,
        charges: row.Charges,
        lastDate: row.LastDate,
      })));
      ["total", ...(isBills ? ["penalty", "previousBalance", "discount", "rateAmount", "charges"] : [])]
        .forEach((key) => { summarySheet.getColumn(key).numFmt = '#,##0.00'; });

      const detailSheet = workbook.addWorksheet(isBills ? "Bill Details" : "Payment Details");
      const detailColumns = isBills ? columns.map(([header, key]) => [header, key]) : columns;
      detailSheet.columns = detailColumns.map(([header, key]) => ({
        header,
        key,
        width: Math.min(Math.max(header.length + 2, 15), 26),
      }));
      detailSheet.addRows(records);
      detailColumns.forEach(([header, key]) => {
        if (/amount|charge|balance|penalty|discount/i.test(header)) {
          detailSheet.getColumn(key).numFmt = '#,##0.00';
        }
      });
      [summarySheet, detailSheet].forEach((sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1769E0" } };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}` };
      });

      const content = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([content], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `powerpay-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (exportFailure) {
      setExportError(exportFailure.message || `Unable to export ${kind}.`);
    } finally {
      setExporting(false);
    }
  };

  const exportFlatActivity = async () => {
    setExporting(true);
    setExportError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const summarySheet = workbook.addWorksheet("Flat Summary");
      summarySheet.columns = [
        { header: "Flat", key: "UnitNo", width: 16 },
        { header: "Customer", key: "CustomerName", width: 28 },
        { header: "Bill count", key: "BillCount", width: 14 },
        { header: "Bill charges", key: "BillAmount", width: 18 },
        { header: "Payment count", key: "PaymentCount", width: 16 },
        { header: "Payment amount", key: "PaymentAmount", width: 18 },
        { header: "Opening balance", key: "OpeningBalance", width: 18 },
        { header: "Closing balance", key: "ClosingBalance", width: 18 },
      ];
      summarySheet.addRows(flatActivitySummaries);
      summarySheet.getColumn("BillAmount").numFmt = "#,##0.00";
      summarySheet.getColumn("PaymentAmount").numFmt = "#,##0.00";
      summarySheet.getColumn("OpeningBalance").numFmt = "#,##0.00";
      summarySheet.getColumn("ClosingBalance").numFmt = "#,##0.00";

      const transactionsSheet = workbook.addWorksheet("Transactions");
      transactionsSheet.columns = [
        { header: "Date", key: "Date", width: 16 },
        { header: "Flat", key: "UnitNo", width: 16 },
        { header: "Particulars", key: "Particulars", width: 24 },
        { header: "Payment Mode", key: "PaymentMode", width: 18 },
        { header: "Bill No", key: "BillNo", width: 24 },
        { header: "Debit", key: "Debit", width: 18 },
        { header: "Credit", key: "Credit", width: 18 },
      ];
      transactionsSheet.addRows(activityRows.map((row) => ({
        ...row,
        Date: row.Date && !Number.isNaN(new Date(row.Date).getTime()) ? new Date(row.Date) : null,
      })));
      transactionsSheet.getColumn("Date").numFmt = "dd/mm/yyyy";
      transactionsSheet.getColumn("Debit").numFmt = "#,##0.00";
      transactionsSheet.getColumn("Credit").numFmt = "#,##0.00";

      [summarySheet, transactionsSheet].forEach((sheet) => {
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1769E0" } };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}` };
      });

      const content = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([content], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `powerpay-flat-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (exportFailure) {
      setExportError(exportFailure.message || "Unable to export the flat-wise ledger.");
    } finally {
      setExporting(false);
    }
  };

  const renderSection = (kind, title, description, summaries, amountLabel) => {
    const isBills = kind === "bills";
    const sectionRecords = isBills ? visibleBills : visiblePayments;
    const recordCount = sectionRecords.length;
    return <section className="eb-admin-table eb-admin-ledger-section">
      <div className="eb-admin-table-head eb-admin-ledger-head">
        <div><h2>{title}</h2><p>{description}</p></div>
        <div className="eb-admin-ledger-actions">
          {isBills && <button className="eb-admin-refresh" type="button" onClick={loadLedger} title="Refresh ledger" disabled={loading || exporting}><RefreshCw size={17} /></button>}
          <button className="eb-btn eb-btn-primary" type="button" onClick={() => exportWorkbook(kind, sectionRecords, summaries)} disabled={loading || exporting || recordCount === 0}>
            <Download size={15} />{exporting ? "Preparing..." : "Download Excel"}
          </button>
        </div>
      </div>
      <div className="eb-admin-ledger-section-total"><strong>{recordCount}</strong> {isBills ? "bills" : "payments"} across <strong>{summaries.length}</strong> customers</div>
      {recordCount ? <div className="eb-admin-user-table-wrap"><table className="eb-admin-user-table eb-admin-ledger-table">
        <thead><tr><th>Flat / customer</th><th>{isBills ? "Bill count" : "Payment count"}</th><th>{amountLabel}</th>{isBills && <><th>Penalty</th><th>Previous balance</th><th>Discount</th><th>Rate charges</th><th>Other charges</th></>}<th>Latest date</th></tr></thead>
        <tbody>{summaries.map((row) => <tr key={row.CustomerID ?? row.UnitNo}>
          <td><strong>{row.UnitNo}</strong><small>{row.CustomerName}</small></td>
          <td>{row.RecordCount}</td><td><strong>{money(row.Total)}</strong></td>
          {isBills && <><td>{money(row.Penalty)}</td><td>{money(row.PreviousBalance)}</td><td>{money(row.Discount)}</td><td>{money(row.RateAmount)}</td><td>{money(row.Charges)}</td></>}
          <td>{dateValue(row.LastDate)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="eb-admin-user-state">{isBills ? "No bills found." : "No recorded payments found."}</div>}
    </section>;
  };

  const renderFlatActivity = () => <section className="eb-admin-table eb-admin-ledger-section">
    <div className="eb-admin-table-head eb-admin-ledger-head">
      <div><h2>Flat-wise ledger</h2><p>Opening is the earliest bill's previous balance; bill charges exclude that carry-over, and closing = opening + bill charges - payments.</p></div>
      <div className="eb-admin-ledger-actions">
        <button className="eb-btn eb-btn-primary" type="button" onClick={exportFlatActivity} disabled={exporting || flatActivitySummaries.length === 0}>
          <Download size={15} />{exporting ? "Preparing..." : "Download Excel"}
        </button>
      </div>
    </div>
    {flatActivitySummaries.length ? <div className="eb-admin-user-table-wrap">
      <table className="eb-admin-user-table eb-admin-ledger-table">
        <thead><tr><th>Flat / customer</th><th>Bills</th><th>Bill charges</th><th>Payments</th><th>Payment amount</th><th>Opening balance</th><th>Closing balance</th></tr></thead>
        <tbody>{flatActivitySummaries.map((row) => <tr key={row.FlatID ?? row.UnitNo}>
          <td><strong>{row.UnitNo}</strong><small>{row.CustomerName}</small></td>
          <td>{row.BillCount}</td><td><strong>{money(row.BillAmount)}</strong></td>
          <td>{row.PaymentCount}</td><td><strong>{money(row.PaymentAmount)}</strong></td>
          <td>{money(row.OpeningBalance)}</td><td>{money(row.ClosingBalance)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <div className="eb-admin-user-state">No bills or payments found for this filter.</div>}
    <div className="eb-admin-ledger-section-total"><strong>{visibleBills.length}</strong> bills and <strong>{visiblePayments.length}</strong> payments</div>
    {activityRows.length ? <div className="eb-admin-user-table-wrap">
      <table className="eb-admin-user-table eb-admin-ledger-table">
        <thead><tr><th>Date</th><th>Flat</th><th>Particulars</th><th>Payment mode</th><th>Bill No</th><th>Debit</th><th>Credit</th></tr></thead>
        <tbody>{activityRows.map((row, index) => <tr key={`${row.UnitNo}-${row.Date}-${index}`}>
          <td>{dateValue(row.Date)}</td><td>{row.UnitNo}</td><td>{row.Particulars}</td><td>{row.PaymentMode}</td><td>{row.BillNo}</td>
          <td>{row.Debit ? money(row.Debit) : "-"}</td><td>{row.Credit ? money(row.Credit) : "-"}</td>
        </tr>)}</tbody>
      </table>
    </div> : null}
  </section>;

  if (loading) return <div className="eb-admin-user-state">Loading ledger...</div>;
  if (error) return <div className="eb-admin-empty"><div><BookOpenText size={25} /></div><h2>Ledger unavailable</h2><p>{error}</p><button className="eb-btn eb-btn-light" type="button" onClick={loadLedger}><RefreshCw size={15} />Retry</button></div>;

  return <div className="eb-admin-ledger">
    <div className="eb-admin-ledger-stats">
      <div className="eb-admin-stat"><BookOpenText size={19} /><small>Flats in ledger</small><strong>{ledger.accounts.length}</strong><span>All accounts</span></div>
      <div className="eb-admin-stat"><small>Total billed amount</small><strong>{money(totals.totalBilledAmount)}</strong><span>All generated bills</span></div>
      <div className="eb-admin-stat"><small>Total penalty</small><strong>{money(totals.penalty)}</strong><span>Bill + late payment</span></div>
      <div className="eb-admin-stat"><small>Outstanding</small><strong>{money(totals.outstanding)}</strong><span>After recorded payments</span></div>
    </div>
    <div className="eb-admin-ledger-filters">
      <label className="eb-admin-ledger-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flat, customer, or meter" /></label>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter ledger by status">
        <option>All</option><option>Pending</option><option>Paid</option><option>Overdue</option>
      </select>
    </div>
    {renderFlatActivity()}
    {renderSection("bills", "Bills", "Flat-wise bill count and bill amount. Download the workbook for each bill's full details.", billSummaries, "Bill amount")}
    {renderSection("payments", "Payments", "Customer-wise payment count and paid amount. Download the workbook for each payment's full details.", paymentSummaries, "Total paid")}
    {exportError && <div className="eb-admin-user-state eb-admin-user-error">{exportError}</div>}
  </div>;
}

export default AdminLedger;
