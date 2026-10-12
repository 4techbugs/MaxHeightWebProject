export function normalizeBillPayload(payload = {}) {
  const safeNumber = (value, fallback = 0) => {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const parseIntValue = (value, fallback = 0) => {
    const rawValue = String(value ?? "").trim();
    if (!rawValue) return fallback;
    const matches = rawValue.match(/-?\d+/g);
    const parsed = matches ? Number(matches.join("")) : Number(rawValue);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  };

  const decodeDateValue = (value, fallback) => {
    const raw = String(value ?? "").trim();
    if (!raw) return fallback;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parsed = new Date(`${raw}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? fallback : parsed;
    }

    if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
      const parsed = new Date(`1970-01-01T${raw}`);
      return Number.isNaN(parsed.getTime()) ? fallback : parsed;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  };

  const now = new Date();
  const gridUnits = safeNumber(payload.grid ?? payload.Unit ?? 0, 0);
  const gdUnits = safeNumber(payload.gd ?? payload.DGUnit ?? 0, 0);
  const arrears = safeNumber(payload.arrears ?? payload.PreviousBalance ?? 0, 0);
  const remarks = String(payload.remarks ?? payload.Remarks ?? "").trim();
  const meterNumber = String(payload.meter ?? payload.MeterNumber ?? payload.MeeterNumber ?? "").trim();
  const flatValue = String(payload.flat ?? payload.FlatID ?? payload.UnitNo ?? payload.unitNo ?? "").trim();
  const customerName = String(payload.customerName ?? payload.CustomerName ?? (flatValue ? `Customer ${flatValue}` : "Walk-in Customer")).trim();
  const address = String(payload.address ?? payload.Address ?? "").trim();
  const dueDate = decodeDateValue(payload.dueDate || payload.DueDate || new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), new Date(now));
  const billDate = decodeDateValue(payload.billDate || payload.BillDate || now, now);
  const fromDate = decodeDateValue(payload.fromDate || payload.FromDate || new Date(now.getFullYear(), now.getMonth(), 1), new Date(now));
  const toDate = decodeDateValue(payload.toDate || payload.ToDate || now, now);
  const charge = safeNumber(payload.charge ?? payload.Charge ?? 0, 0);
  const rateAmount = safeNumber(payload.rateAmount ?? payload.RateAmount, 0);
  const dgCharge = safeNumber(payload.dgCharge ?? payload.DGCharge ?? 0, 0);
  const fuelSearchCharge = safeNumber(payload.fuelSearchCharge ?? payload.FuelSearchCharge ?? 0, 0);
  const ctDtRent = safeNumber(payload.ctDtRent ?? payload.CTDTRent ?? 0, 0);
  const dutyCharge = safeNumber(payload.dutyCharge ?? payload.DutyCharge ?? 0, 0);
  const fixedCharge = safeNumber(payload.fixedCharge ?? payload.FixedCharge ?? payload.MiscCharge ?? 495, 495);
  const otherCharge = safeNumber(payload.other ?? payload.otherCharge ?? payload.OtherCharge ?? 0, 0);
  const totalAmount = safeNumber(payload.total ?? payload.TotalPaidAmount ?? charge + dgCharge + arrears, 0);
  const interest = safeNumber(payload.interest ?? payload.penalty ?? 0, 0);
  const load = String(payload.load ?? payload.Load ?? "").trim();
  const createdBy = String(payload.createdBy ?? payload.CreatedBy ?? "admin").trim() || "admin";
  const modifiedBy = String(payload.modifiedBy ?? payload.ModifiedBy ?? createdBy).trim() || createdBy;
  const receiptId = String(payload.receiptId ?? payload.ReceiptID ?? `BILL-${billDate.toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-6)}`);

  return {
    FlatID: flatValue || "0",
    CustomerID: parseIntValue(payload.CustomerID ?? 1, 1),
    BillDate: billDate,
    DueDate: dueDate,
    FromDate: fromDate,
    ToDate: toDate,
    Unit: gridUnits,
    Charge: charge,
    CreatedBy: createdBy,
    CreatedDate: now,
    CreatedTime: decodeDateValue(payload.CreatedTime || new Date().toTimeString().slice(0, 8), new Date("1970-01-01T00:00:00")),
    ModifiedBy: modifiedBy,
    ModifiedDate: now,
    ModifiedTime: decodeDateValue(payload.ModifiedTime || new Date().toTimeString().slice(0, 8), new Date("1970-01-01T00:00:00")),
    Status: String(payload.status ?? payload.Status ?? "Pending").trim() || "Pending",
    ReceiptID: receiptId,
    ChargeAmount: charge,
    RateAmount: rateAmount,
    FuelSearchCharge: fuelSearchCharge,
    CTDTRent: ctDtRent,
    DutyCharge: dutyCharge,
    PreviousBalance: arrears,
    TotalPaidAmount: safeNumber(payload.totalPaidAmount ?? payload.TotalPaidAmount ?? totalAmount, totalAmount),
    penalty: interest,
    Discount: safeNumber(payload.discount ?? payload.Discount ?? 0, 0),
    FixedCharge: fixedCharge,
    OtherCharge: otherCharge,
    Load: load,
    MeterNumber: meterNumber,
    MeeterNumber: meterNumber,
    CustomerName: customerName,
    Address: address,
    DGUnit: gdUnits,
    DGCharge: dgCharge,
    DGAmount: safeNumber(payload.dgAmount ?? payload.DGAmount ?? gdUnits * 26, 0),
    PriviousBalance: arrears,
    Remarks: remarks,
  };
}
