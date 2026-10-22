import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { sql } from "./db.js";
import { getDbPool } from "./db.js";
import { normalizeBillPayload } from "./billUtils.js";

const app = express();
const port = Number(process.env.API_PORT || 3001);
const otpStore = new Map();
const clientSessions = new Map();
const CLIENT_SESSION_DURATION = 8 * 60 * 60 * 1000;
const DEFAULT_LOCAL_ADMIN = Object.freeze({ username: "Admin", password: "Admin@123" });
const CONFIGURED_ADMIN = Object.freeze({
  username: String(process.env.ADMIN_USERNAME || DEFAULT_LOCAL_ADMIN.username).trim(),
  password: String(process.env.ADMIN_PASSWORD || DEFAULT_LOCAL_ADMIN.password),
});
const ELECTRIC_BILL_COLUMNS = [
  "FlatID", "CustomerID", "BillDate", "DueDate", "FromDate", "ToDate",
  "Unit", "Charge", "CreatedBy", "CreatedDate", "CreatedTime", "ModifiedBy",
  "ModifiedDate", "ModifiedTime", "Status", "ReceiptID", "ChargeAmount",
  "RateAmount", "FuelSearchCharge", "CTDTRent", "DutyCharge", "PreviousBalance", "TotalPaidAmount", "penalty", "Discount",
  "MiscCharge", "FixedCharge", "OtherCharge", "Load", "MeterNumber", "CustomerName", "DGUnit", "DGCharge",
  "DGAmount", "Address", "Remarks"
];

function isConfiguredAdmin(username, password) {
  const candidateUsername = String(username || "").trim();
  const candidatePassword = String(password || "");

  if (!candidateUsername || !candidatePassword) {
    return false;
  }

  const matchesLocalFallback =
    process.env.NODE_ENV !== "production" &&
    candidateUsername.toLowerCase() === DEFAULT_LOCAL_ADMIN.username.toLowerCase() &&
    candidatePassword.toLowerCase() === DEFAULT_LOCAL_ADMIN.password.toLowerCase();

  const matchesConfiguredAdmin =
    candidateUsername.toLowerCase() === CONFIGURED_ADMIN.username.toLowerCase() &&
    candidatePassword.toLowerCase() === CONFIGURED_ADMIN.password.toLowerCase();

  return matchesLocalFallback || matchesConfiguredAdmin;
}

async function ensureElectricBillTable() {
  try {
    const pool = await getDbPool();
    const tableResult = await pool.request().query(`
      SELECT c.name AS column_name
      FROM sys.columns c
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      WHERE t.name = 'tb_ElectricBill'
    `);

    const existingColumns = new Set((tableResult.recordset || []).map((row) => row.column_name));
    const missingColumns = ELECTRIC_BILL_COLUMNS.filter((column) => !existingColumns.has(column));

    for (const column of missingColumns) {
      let sqlType = "NVARCHAR(255) NULL";
      if (["Unit", "Charge", "ChargeAmount", "RateAmount", "FuelSearchCharge", "CTDTRent", "DutyCharge", "PreviousBalance", "TotalPaidAmount", "penalty", "Discount", "MiscCharge", "FixedCharge", "OtherCharge", "Load", "DGUnit", "DGCharge", "DGAmount"].includes(column)) {
        sqlType = "DECIMAL(10,2) NULL";
      } else if (["CustomerID"].includes(column)) {
        sqlType = "INT NULL";
      } else if (["BillDate", "DueDate", "FromDate", "ToDate", "CreatedDate", "ModifiedDate"].includes(column)) {
        sqlType = "DATE NULL";
      } else if (["CreatedTime", "ModifiedTime"].includes(column)) {
        sqlType = "TIME NULL";
      }

      await pool.request().query(`ALTER TABLE [dbo].[tb_ElectricBill] ADD [${column}] ${sqlType}`);
    }
  } catch (error) {
    if (String(error.message).includes("Invalid object name 'tb_ElectricBill'")) {
      await pool.request().query(`
        CREATE TABLE [dbo].[tb_ElectricBill] (
          [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          [FlatID] NVARCHAR(50) NOT NULL,
          [CustomerID] INT NULL,
          [BillDate] DATE NOT NULL,
          [DueDate] DATE NOT NULL,
          [FromDate] DATE NULL,
          [ToDate] DATE NULL,
          [Unit] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [Charge] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [CreatedBy] NVARCHAR(100) NOT NULL,
          [CreatedDate] DATE NOT NULL,
          [CreatedTime] TIME NULL,
          [ModifiedBy] NVARCHAR(100) NULL,
          [ModifiedDate] DATE NULL,
          [ModifiedTime] TIME NULL,
          [Status] NVARCHAR(50) NOT NULL DEFAULT N'Pending',
          [ReceiptID] NVARCHAR(50) NOT NULL UNIQUE,
          [ChargeAmount] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [RateAmount] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [FuelSearchCharge] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [CTDTRent] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [DutyCharge] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [PreviousBalance] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [TotalPaidAmount] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [penalty] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [Discount] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [MiscCharge] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [FixedCharge] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [OtherCharge] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [Load] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [MeterNumber] NVARCHAR(50) NOT NULL,
          [CustomerName] NVARCHAR(100) NULL,
          [Address] NVARCHAR(255) NULL,
          [DGUnit] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [DGCharge] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [DGAmount] DECIMAL(10,2) NOT NULL DEFAULT 0,
          [Remarks] NVARCHAR(255) NULL
        );
      `);
      return;
    }
    console.error("Electric bill schema ensure failed:", error.message);
  }
}

async function ensureChargeMasterTable() {
  const pool = await getDbPool();
  await pool.request().query(`
    IF OBJECT_ID(N'[dbo].[ElectricityChargeMaster]', N'U') IS NULL
    BEGIN
      CREATE TABLE [dbo].[ElectricityChargeMaster] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [MasterType] NVARCHAR(80) NOT NULL,
        [Name] NVARCHAR(150) NOT NULL,
        [AliasName] NVARCHAR(100) NULL,
        [Amount] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [Status] NVARCHAR(30) NOT NULL DEFAULT N'Active',
        [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE()
      );
    END
  `);
}

async function ensureAssignFlatArrearsColumn() {
  const pool = await getDbPool();
  await pool.request().query(`
    IF COL_LENGTH(N'dbo.AssignFlat', N'arrears') IS NULL
    BEGIN
      IF COL_LENGTH(N'dbo.AssignFlat', N'areras') IS NOT NULL
        EXEC sp_rename N'dbo.AssignFlat.areras', N'arrears', N'COLUMN';
      ELSE
        ALTER TABLE [dbo].[AssignFlat] ADD [arrears] DECIMAL(18,2) NULL;
    END;
  `);
}

async function ensurePenaltyTable() {
  const pool = await getDbPool();
  await pool.request().query(`
    IF OBJECT_ID(N'[dbo].[tb_ElectricityPenalty]', N'U') IS NULL
    BEGIN
      CREATE TABLE [dbo].[tb_ElectricityPenalty] (
        [PenaltyID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [BillID] INT NOT NULL,
        [FlatID] INT NOT NULL,
        [DueDate] DATE NOT NULL,
        [PaymentDate] DATE NOT NULL,
        [BaseAmount] DECIMAL(18,2) NOT NULL,
        [AnnualRate] DECIMAL(5,2) NOT NULL DEFAULT 18.00,
        [OverdueDays] INT NOT NULL DEFAULT 0,
        [PenaltyAmount] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [TotalAmount] DECIMAL(18,2) NOT NULL,
        [PaymentID] INT NULL,
        [Status] NVARCHAR(30) NOT NULL DEFAULT N'Calculated',
        [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE()
      );
      CREATE INDEX [IX_tb_ElectricityPenalty_BillID]
        ON [dbo].[tb_ElectricityPenalty] ([BillID]);
    END
  `);
}

function calculatePenalty(baseAmount, dueDate, paymentDate) {
  const due = new Date(`${dueDate}T00:00:00`);
  const paid = new Date(`${paymentDate}T00:00:00`);
  const overdueDays = Math.max(0, Math.floor((paid - due) / 86400000));
  const penaltyAmount = Math.round(baseAmount * 0.18 * overdueDays / 365 * 100) / 100;
  return { overdueDays, penaltyAmount, totalAmount: Math.round((baseAmount + penaltyAmount) * 100) / 100 };
}

async function getPaymentQuote(pool, flat, paymentDate = new Date()) {
  const assignedFlat = await pool.request()
    .input("flat", sql.NVarChar(50), flat)
    .query(`
      SELECT TOP (1) [AssignFlatID], [CustomerID], [FlatDetailID], [UnitNo]
      FROM [dbo].[AssignFlat]
      WHERE [UnitNo] = @flat OR CONVERT(NVARCHAR(50), [AssignFlatID]) = @flat
      ORDER BY [AssignFlatID]
    `);
  if (!assignedFlat.recordset.length) return null;

  const selected = assignedFlat.recordset[0];
  const bill = await pool.request()
    .input("flatId", sql.Int, Number(selected.AssignFlatID))
    .query(`
      SELECT TOP (1) [ID], [FlatID], [DueDate], [ChargeAmount]
      FROM [dbo].[tb_ElectricBill]
      WHERE TRY_CONVERT(INT, [FlatID]) = @flatId
        AND LTRIM(RTRIM(COALESCE([Status], ''))) <> 'Paid'
      ORDER BY [DueDate] DESC, [ID] DESC
    `);
  if (!bill.recordset.length) return { selected, bill: null, overdueDays: 0, penaltyAmount: 0, totalAmount: 0 };

  const currentBill = bill.recordset[0];
  const paymentDateValue = new Date(paymentDate);
  const paymentDateText = paymentDateValue.toISOString().slice(0, 10);
  const dueDateText = new Date(currentBill.DueDate).toISOString().slice(0, 10);
  const baseAmount = Number(currentBill.ChargeAmount || 0);
  return {
    selected,
    bill: currentBill,
    dueDate: dueDateText,
    paymentDate: paymentDateText,
    baseAmount,
    ...calculatePenalty(baseAmount, dueDateText, paymentDateText),
  };
}

async function applyCalculatedArrears(pool, flatId, billDate, payload, excludedBillId = null) {
  const result = await pool.request()
    .input("flatId", sql.Int, Number(flatId))
    .input("billDate", sql.DateTime, billDate)
    .input("excludedBillId", sql.Int, excludedBillId)
    .query(`
      WITH prior_bills AS (
        SELECT [BillDate], [ID], [PreviousBalance], [TotalPaidAmount], [RateAmount], [ChargeAmount],
          [Charge], [DGAmount], [FuelSearchCharge], [CTDTRent], [DutyCharge], [FixedCharge],
          [MiscCharge], [OtherCharge], [penalty], [Discount]
        FROM [dbo].[tb_ElectricBill]
        WHERE TRY_CONVERT(INT, [FlatID]) = @flatId
          AND [BillDate] < @billDate
          AND (@excludedBillId IS NULL OR [ID] <> @excludedBillId)
      ),
      prior_totals AS (
        SELECT
          COUNT(*) AS [BillCount],
          SUM(CASE
            WHEN COALESCE([TotalPaidAmount], 0) > 0
            THEN [TotalPaidAmount] - COALESCE([PreviousBalance], 0)
            ELSE COALESCE(NULLIF([RateAmount], 0), NULLIF([ChargeAmount], 0), [Charge], 0)
              + COALESCE([DGAmount], 0)
              + COALESCE([FuelSearchCharge], 0)
              + COALESCE([CTDTRent], 0)
              + COALESCE([DutyCharge], 0)
              + COALESCE(NULLIF([FixedCharge], 0), [MiscCharge], 0)
              + COALESCE([OtherCharge], 0)
              + COALESCE([penalty], 0)
              - COALESCE([Discount], 0)
          END) AS [BilledCharges]
        FROM prior_bills
      )
      SELECT
        prior_totals.[BillCount],
        COALESCE(prior_totals.[BilledCharges], 0) AS [BilledCharges],
        COALESCE(opening_bill.[OpeningBalance], 0) AS [OpeningBalance],
        COALESCE(payment_totals.[PaidAmount], 0) AS [PaidAmount]
      FROM prior_totals
      OUTER APPLY (
        SELECT TOP (1)
          COALESCE([PreviousBalance], 0) AS [OpeningBalance],
          [BillDate] AS [OpeningBillDate]
        FROM prior_bills
        ORDER BY [BillDate], [ID]
      ) AS opening_bill
      OUTER APPLY (
        SELECT SUM(COALESCE([Amount], 0)) AS [PaidAmount]
        FROM [dbo].[tb_Payment]
        WHERE TRY_CONVERT(INT, [FlatID]) = @flatId
          AND LTRIM(RTRIM(COALESCE([Status], ''))) = 'Active'
          AND [ReceiptDate] >= opening_bill.[OpeningBillDate]
          AND [ReceiptDate] < DATEADD(DAY, 1, @billDate)
      ) AS payment_totals
    `);
  const priorBalance = result.recordset[0];
  if (Number(priorBalance?.BillCount) > 0) {
    const calculatedArrears = Math.max(0, Math.round((
      Number(priorBalance.OpeningBalance || 0)
      + Number(priorBalance.BilledCharges || 0)
      - Number(priorBalance.PaidAmount || 0)
    ) * 100) / 100);
    const arrearsDifference = Math.round((calculatedArrears - Number(payload.PreviousBalance || 0)) * 100) / 100;
    payload.PreviousBalance = calculatedArrears;
    payload.PriviousBalance = calculatedArrears;
    payload.ChargeAmount = Math.round((Number(payload.ChargeAmount || 0) + arrearsDifference) * 100) / 100;
    payload.TotalPaidAmount = Math.round((Number(payload.TotalPaidAmount || 0) + arrearsDifference) * 100) / 100;
  }
}

app.use(cors());
app.use(express.json({ limit: "5mb" }));

async function sendOtp(phone, otp) {
  if (!process.env.SMS_WEBHOOK_URL) {
    if (process.env.NODE_ENV === "production") throw new Error("SMS delivery is not configured.");
    console.log(`Development OTP for ${phone}: ${otp}`);
    return false;
  }

  const smsResponse = await fetch(process.env.SMS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message: `Your PowerPay OTP is ${otp}. It expires in 5 minutes.` }),
  });

  if (!smsResponse.ok) throw new Error(`SMS provider returned ${smsResponse.status}`);
  return true;
}

app.post("/api/auth/request-otp", async (request, response) => {
  const meter = String(request.body?.meter || "").trim();
  const phone = String(request.body?.phone || "").trim();

  if (!/^[a-z0-9-]{6,50}$/i.test(meter) || !/^\d{10}$/.test(phone)) {
    return response.status(400).json({ message: "Enter a valid meter number and 10-digit phone number." });
  }

  try {
    const pool = await getDbPool();
    const result = await pool.request()
      .input("meter", sql.VarChar(50), meter)
      .input("phone", sql.VarChar(20), phone)
      .query(`
        SELECT TOP (1) customer.[CustomerID]
        FROM [dbo].[tb_ElectricBill] bill
        INNER JOIN [dbo].[Customer] customer ON customer.[CustomerID] = bill.[CustomerID]
        WHERE bill.[MeterNumber] = @meter
          AND (@phone = LTRIM(RTRIM(CONVERT(NVARCHAR(20), customer.[Mobile])))
            OR @phone = LTRIM(RTRIM(CONVERT(NVARCHAR(20), customer.[ContactNo]))))
        ORDER BY bill.[ID] DESC
      `);

    if (!result.recordset.length) {
      return response.status(401).json({ message: "Meter number and phone number do not match." });
    }

    const otp = String(randomInt(100000, 1000000));
    const smsSent = await sendOtp(phone, otp);
    otpStore.set(`${meter}:${phone}`, { otp, customerId: result.recordset[0].CustomerID, expiresAt: Date.now() + 5 * 60 * 1000 });
    const payload = { message: "OTP sent successfully.", smsSent };

    if (!process.env.SMS_WEBHOOK_URL && process.env.NODE_ENV !== "production") payload.devOtp = otp;
    return response.json(payload);
  } catch (error) {
    console.error("OTP request failed:", error.message);
    return response.status(503).json({ message: "Unable to request an OTP right now." });
  }
});

app.post("/api/auth/verify-otp", (request, response) => {
  const meter = String(request.body?.meter || "").trim();
  const phone = String(request.body?.phone || "").trim();
  const otp = String(request.body?.otp || "").trim();
  const key = `${meter}:${phone}`;
  const savedOtp = otpStore.get(key);

  if (!savedOtp || savedOtp.expiresAt < Date.now() || savedOtp.otp !== otp) {
    return response.status(401).json({ message: "The OTP is incorrect or expired." });
  }

  otpStore.delete(key);
  if (!Number.isInteger(Number(savedOtp.customerId))) {
    return response.status(401).json({ message: "The customer account linked to this meter could not be verified." });
  }
  const sessionId = randomUUID();
  clientSessions.set(sessionId, { meter, phone, customerId: Number(savedOtp.customerId), expiresAt: Date.now() + CLIENT_SESSION_DURATION });
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `powerpay_client_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${CLIENT_SESSION_DURATION / 1000}${secureCookie}`);
  return response.json({ authenticated: true });
});

function requireClientSession(request, response, next) {
  const cookie = String(request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("powerpay_client_session="));
  const sessionId = cookie?.slice("powerpay_client_session=".length);
  const session = sessionId ? clientSessions.get(sessionId) : null;

  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) clientSessions.delete(sessionId);
    return response.status(401).json({ message: "Your client session has expired. Please sign in again." });
  }

  request.clientSession = session;
  return next();
}

app.post("/api/auth/logout", (request, response) => {
  const cookie = String(request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("powerpay_client_session="));
  const sessionId = cookie?.slice("powerpay_client_session=".length);
  if (sessionId) clientSessions.delete(sessionId);
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `powerpay_client_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie}`);
  return response.json({ authenticated: false });
});

async function getClientAccountData(meter, customerId) {
  const pool = await getDbPool();
  const billResult = await pool.request()
    .input("meter", sql.VarChar(50), meter)
    .input("customerId", sql.Int, customerId)
    .query(`
      SELECT TOP (1000) eb.[ID], eb.[ReceiptID], eb.[BillDate], eb.[DueDate], eb.[Unit], eb.[DGUnit],
        eb.[ChargeAmount], eb.[RateAmount], eb.[PreviousBalance], eb.[TotalPaidAmount],
        eb.[penalty], eb.[Discount], eb.[FixedCharge], eb.[OtherCharge], eb.[Status],
        eb.[MeterNumber], eb.[FlatID],
        COALESCE(NULLIF(eb.[CustomerName], ''), c.[CustomerName]) AS [CustomerName],
        COALESCE(af.[UnitNo], CONVERT(NVARCHAR(50), eb.[FlatID])) AS [UnitNo]
      FROM [dbo].[tb_ElectricBill] eb
      LEFT JOIN [dbo].[AssignFlat] af ON TRY_CONVERT(INT, eb.[FlatID]) = af.[AssignFlatID]
      LEFT JOIN [dbo].[Customer] c
        ON LTRIM(RTRIM(CONVERT(NVARCHAR(50), c.[CustomerID]))) = LTRIM(RTRIM(CONVERT(NVARCHAR(50), eb.[CustomerID])))
      WHERE eb.[MeterNumber] = @meter AND eb.[CustomerID] = @customerId
      ORDER BY eb.[BillDate] DESC, eb.[ID] DESC
    `);

  const paymentResult = await pool.request()
    .input("meter", sql.VarChar(50), meter)
    .input("customerId", sql.Int, customerId)
    .query(`
      SELECT TOP (100) p.[ID], p.[PaymentMode], p.[Bank], p.[Branch], p.[ChequeNo], bill.[BillNumber],
        p.[ReceiptDate], p.[Amount], p.[Status], p.[FlatID],
        COALESCE(af.[UnitNo], CONVERT(NVARCHAR(50), p.[FlatID])) AS [UnitNo],
        COALESCE(p.[CustomerName], c.[CustomerName]) AS [CustomerName]
      FROM [dbo].[tb_Payment] p
      INNER JOIN [dbo].[AssignFlat] af ON af.[AssignFlatID] = p.[FlatID]
      LEFT JOIN [dbo].[Customer] c ON c.[CustomerID] = p.[CustomerID]
      OUTER APPLY (
        SELECT TOP (1) eb.[ReceiptID] AS [BillNumber]
        FROM [dbo].[tb_ElectricBill] eb
        WHERE eb.[MeterNumber] = @meter
          AND TRY_CONVERT(INT, eb.[FlatID]) = p.[FlatID]
          AND eb.[BillDate] <= p.[ReceiptDate]
        ORDER BY eb.[BillDate] DESC, eb.[ID] DESC
      ) bill
      WHERE EXISTS (
          SELECT 1 FROM [dbo].[tb_ElectricBill] eb
          WHERE eb.[MeterNumber] = @meter
            AND eb.[CustomerID] = @customerId
            AND TRY_CONVERT(INT, eb.[FlatID]) = p.[FlatID]
        )
      ORDER BY p.[ReceiptDate] DESC, p.[ID] DESC
    `);

  const bills = billResult.recordset;
  const payments = paymentResult.recordset;
  return {
    client: {
      meter,
      name: bills[0]?.CustomerName || "",
      unit: bills[0]?.UnitNo || "",
    },
    bills,
    payments,
  };
}

app.get("/api/client/dashboard", requireClientSession, async (request, response) => {
  try {
    return response.json(await getClientAccountData(request.clientSession.meter, request.clientSession.customerId));
  } catch (error) {
    console.error("Client dashboard fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load your account right now." });
  }
});

app.get("/api/client/bills", requireClientSession, async (request, response) => {
  try {
    const { bills } = await getClientAccountData(request.clientSession.meter, request.clientSession.customerId);
    return response.json(bills);
  } catch (error) {
    console.error("Client bill fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load your bills right now." });
  }
});

app.get("/api/client/bills/:id", requireClientSession, async (request, response) => {
  const billId = Number(request.params.id);
  if (!Number.isInteger(billId) || billId <= 0) return response.status(400).json({ message: "A valid bill ID is required." });
  try {
    const { bills } = await getClientAccountData(request.clientSession.meter, request.clientSession.customerId);
    const bill = bills.find((row) => Number(row.ID) === billId);
    if (!bill) return response.status(404).json({ message: "Bill not found for this client account." });
    return response.json({ ...bill, PhoneNumber: `******${request.clientSession.phone.slice(-4)}` });
  } catch (error) {
    console.error("Client bill details fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load this bill right now." });
  }
});

app.get("/api/client/payments", requireClientSession, async (request, response) => {
  try {
    const { payments } = await getClientAccountData(request.clientSession.meter, request.clientSession.customerId);
    return response.json(payments);
  } catch (error) {
    console.error("Client payment fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load your payments right now." });
  }
});

app.post("/api/auth/admin-login", async (request, response) => {
  const username = String(request.body?.username || "").trim();
  const password = String(request.body?.password || "");

  if (!username || !password) {
    return response.status(400).json({ message: "Enter your username and password." });
  }

  if (isConfiguredAdmin(username, password)) {
    return response.json({
      authenticated: true,
      role: "admin",
      username: CONFIGURED_ADMIN.username,
      source: process.env.NODE_ENV === "production" ? "configured-admin" : "local-fallback",
    });
  }

  try {
    const pool = await getDbPool();
    const result = await pool.request()
      .input("username", sql.NVarChar(100), username)
      .input("password", sql.NVarChar(255), password)
      .query(`
        SELECT TOP (1) [ID], [Username]
        FROM [dbo].[tb_Employee]
        WHERE [Username] = @username AND [Password] = @password
      `);

    if (!result.recordset.length) {
      return response.status(401).json({ message: "Invalid admin username or password." });
    }

    return response.json({ authenticated: true, role: "admin", username: result.recordset[0].Username });
  } catch (error) {
    console.error("Admin login failed:", error.message);
    return response.status(503).json({ message: "Unable to sign in right now." });
  }
});

app.get("/api/admin/overview", async (_request, response) => {
  try {
    const pool = await getDbPool();
    const [clients, bills, payments, recentBills, recentPayments] = await Promise.all([
      pool.request().query("SELECT COUNT(*) AS [TotalClients] FROM [dbo].[AssignFlat] WHERE [UnitNo] IS NOT NULL AND LTRIM(RTRIM([UnitNo])) <> ''"),
      pool.request().query("SELECT COUNT(*) AS [BillsGenerated], SUM(CASE WHEN LTRIM(RTRIM(COALESCE([Status], ''))) = 'Pending' THEN 1 ELSE 0 END) AS [PendingReview] FROM [dbo].[tb_ElectricBill]"),
      pool.request().query("SELECT COALESCE(SUM([Amount]), 0) AS [CollectedPayments] FROM [dbo].[tb_Payment] WHERE LTRIM(RTRIM(COALESCE([Status], ''))) = 'Active'"),
      pool.request().query("SELECT TOP (5) [ID], [FlatID], [CustomerName], [ChargeAmount], [BillDate] FROM [dbo].[tb_ElectricBill] ORDER BY [BillDate] DESC, [ID] DESC"),
      pool.request().query("SELECT TOP (5) [ID], [FlatID], [Amount], [ReceiptDate] FROM [dbo].[tb_Payment] WHERE LTRIM(RTRIM(COALESCE([Status], ''))) = 'Active' ORDER BY [ReceiptDate] DESC, [ID] DESC"),
    ]);
    return response.json({
      stats: {
        totalClients: Number(clients.recordset[0]?.TotalClients || 0),
        billsGenerated: Number(bills.recordset[0]?.BillsGenerated || 0),
        collectedPayments: Number(payments.recordset[0]?.CollectedPayments || 0),
        pendingReview: Number(bills.recordset[0]?.PendingReview || 0),
      },
      recentBills: recentBills.recordset,
      recentPayments: recentPayments.recordset,
    });
  } catch (error) {
    console.error("Admin overview fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load admin overview right now." });
  }
});

app.get("/api/admin/reports", async (request, response) => {
  const from = String(request.query.from || "").trim();
  const to = String(request.query.to || "").trim();
  const dateFilter = (column) => `${from ? ` AND [${column}] >= @from` : ""}${to ? ` AND [${column}] < DATEADD(DAY, 1, @to)` : ""}`;
  try {
    await ensurePenaltyTable();
    const pool = await getDbPool();
    const makeRequest = () => {
      const builder = pool.request();
      if (from) builder.input("from", sql.Date, new Date(`${from}T00:00:00`));
      if (to) builder.input("to", sql.Date, new Date(`${to}T00:00:00`));
      return builder;
    };
    const [summary, monthly, outstanding] = await Promise.all([
      makeRequest().query(`
        SELECT COUNT(*) AS [BillCount], COALESCE(SUM([ChargeAmount]), 0) AS [BilledAmount],
          COALESCE(SUM([RateAmount]), 0) AS [RateAmount], COALESCE(SUM([DGAmount]), 0) AS [DGAmount],
          COALESCE(SUM([penalty]), 0) AS [BillPenalty], COALESCE(SUM([Discount]), 0) AS [Discount]
        FROM [dbo].[tb_ElectricBill] WHERE 1 = 1${dateFilter("BillDate")}`),
      makeRequest().query(`
        SELECT CONVERT(char(7), [BillDate], 120) AS [Month], COUNT(*) AS [BillCount],
          COALESCE(SUM([ChargeAmount]), 0) AS [BilledAmount], COALESCE(SUM([penalty]), 0) AS [Penalty]
        FROM [dbo].[tb_ElectricBill] WHERE 1 = 1${dateFilter("BillDate")}
        GROUP BY CONVERT(char(7), [BillDate], 120) ORDER BY [Month] DESC`),
      makeRequest().query(`
        SELECT TOP (20) b.[FlatID], COALESCE(CONVERT(NVARCHAR(50), af.[UnitNo]), CONVERT(NVARCHAR(50), b.[FlatID])) AS [UnitNo],
          MAX(b.[CustomerName]) AS [CustomerName], SUM(COALESCE(b.[ChargeAmount], 0)) AS [BilledAmount],
          COALESCE(p.[PaidAmount], 0) AS [PaidAmount], SUM(COALESCE(b.[ChargeAmount], 0)) - COALESCE(p.[PaidAmount], 0) AS [Outstanding]
        FROM [dbo].[tb_ElectricBill] b
        LEFT JOIN [dbo].[AssignFlat] af ON CONVERT(NVARCHAR(50), af.[AssignFlatID]) = CONVERT(NVARCHAR(50), b.[FlatID])
        LEFT JOIN (SELECT [FlatID], SUM(COALESCE([Amount], 0)) AS [PaidAmount] FROM [dbo].[tb_Payment] WHERE LTRIM(RTRIM(COALESCE([Status], ''))) = 'Active' GROUP BY [FlatID]) p
          ON TRY_CONVERT(INT, p.[FlatID]) = TRY_CONVERT(INT, b.[FlatID])
        WHERE 1 = 1${dateFilter("BillDate")}
        GROUP BY b.[FlatID], af.[UnitNo], p.[PaidAmount]
        HAVING SUM(COALESCE(b.[ChargeAmount], 0)) - COALESCE(p.[PaidAmount], 0) > 0
        ORDER BY [Outstanding] DESC`),
    ]);
    const paymentResult = await makeRequest().query(`SELECT COALESCE(SUM([Amount]), 0) AS [CollectedAmount] FROM [dbo].[tb_Payment] WHERE LTRIM(RTRIM(COALESCE([Status], ''))) = 'Active'${dateFilter("ReceiptDate")}`);
    const penaltyResult = await makeRequest().query(`SELECT COALESCE(SUM([PenaltyAmount]), 0) AS [LatePenalty] FROM [dbo].[tb_ElectricityPenalty] WHERE LTRIM(RTRIM(COALESCE([Status], ''))) = 'Applied'${dateFilter("PaymentDate")}`);
    return response.json({ summary: { ...summary.recordset[0], CollectedAmount: paymentResult.recordset[0]?.CollectedAmount || 0, LatePenalty: penaltyResult.recordset[0]?.LatePenalty || 0 }, monthly: monthly.recordset, outstanding: outstanding.recordset });
  } catch (error) {
    console.error("Reports fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load reports right now." });
  }
});

app.get("/api/admin/users", async (_request, response) => {
  try {
    const pool = await getDbPool();
    const result = await pool.request().query(`
      SELECT [ID], [Username], [Createdby], [Createdtime], [Modifytime], [Createdate], [Modifydate], [Status]
      FROM [dbo].[tb_Employee]
      ORDER BY [ID] DESC
    `);
    return response.json(result.recordset);
  } catch (error) {
    console.error("Employee list fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load users right now." });
  }
});

app.post("/api/admin/users", async (request, response) => {
  const username = String(request.body?.username || "").trim();
  const password = String(request.body?.password || "");
  if (!username || !password) return response.status(400).json({ message: "Username and password are required." });

  try {
    const pool = await getDbPool();
    const duplicate = await pool.request()
      .input("username", sql.NVarChar(100), username)
      .query("SELECT TOP (1) [ID] FROM [dbo].[tb_Employee] WHERE [Username] = @username");
    if (duplicate.recordset.length) return response.status(409).json({ message: "Username already exists." });

    const columnsResult = await pool.request().query(`
      SELECT c.name AS column_name, ty.name AS data_type
      FROM sys.columns c
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE t.name = 'tb_Employee'
    `);
    const columns = new Map(columnsResult.recordset.map((row) => [row.column_name, row.data_type]));
    const insertMap = { Username: username, Password: password, Createdby: 1, Createdtime: new Date(), Createdate: new Date(), Status: "Active" };
    const insertColumns = Object.keys(insertMap).filter((column) => columns.has(column));
    const insertQuery = `INSERT INTO [dbo].[tb_Employee] (${insertColumns.map((column) => `[${column}]`).join(", ")}) OUTPUT INSERTED.[ID], INSERTED.[Username] VALUES (${insertColumns.map((column) => `@${column}`).join(", ")})`;
    const requestBuilder = pool.request();
    for (const column of insertColumns) {
      const value = insertMap[column];
      if (columns.get(column) === "int") requestBuilder.input(column, sql.Int, Number(value) || 1);
      else if (["datetime", "date", "time"].includes(columns.get(column))) requestBuilder.input(column, sql.DateTime, value);
      else requestBuilder.input(column, sql.NVarChar(255), String(value));
    }
    const result = await requestBuilder.query(insertQuery);
    return response.status(201).json({ message: "User created successfully.", user: result.recordset[0] });
  } catch (error) {
    console.error("Employee creation failed:", error.message);
    return response.status(503).json({ message: "Unable to create user right now." });
  }
});

app.post("/api/admin/customers", async (request, response) => {
  const customerName = String(request.body?.customerName || "").trim();
  const address = String(request.body?.address || "").trim();
  const contactNo = String(request.body?.contactNo || "").trim();
  const mobile = String(request.body?.mobile || contactNo).trim();
  const dob = String(request.body?.dob || "").trim();
  if (!customerName || !dob) return response.status(400).json({ message: "Customer name and date of birth are required." });

  try {
    const pool = await getDbPool();
    const columnsResult = await pool.request().query(`
      SELECT c.name AS column_name, ty.name AS data_type
      FROM sys.columns c
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE t.name = 'Customer'
    `);
    const columns = new Map(columnsResult.recordset.map((row) => [row.column_name, row.data_type]));
    if (!columns.has("CustomerName")) return response.status(503).json({ message: "Customer table is missing the CustomerName column." });

    const insertMap = { CustomerName: customerName, Address: address, ContactNo: contactNo, Mobile: mobile, DOB: dob, Status: "Active" };
    const insertColumns = Object.keys(insertMap).filter((column) => columns.has(column));
    if (columns.has("ProjectID")) {
      const projectResult = await pool.request().query("SELECT TOP (1) [ProjectID] FROM [dbo].[Customer] WHERE [ProjectID] IS NOT NULL ORDER BY [CustomerID] DESC");
      if (!projectResult.recordset.length) return response.status(503).json({ message: "No project is available for the new customer." });
      insertMap.ProjectID = projectResult.recordset[0].ProjectID;
      insertColumns.unshift("ProjectID");
    }
    if (columns.has("CustomerNo")) {
      const latest = await pool.request().query(`SELECT COALESCE(MAX(TRY_CONVERT(INT, [CustomerNo])), 0) + 1 AS [NextCustomerNo] FROM [dbo].[Customer]`);
      insertMap.CustomerNo = String(latest.recordset[0].NextCustomerNo);
      insertColumns.unshift("CustomerNo");
    }
    const insertQuery = `INSERT INTO [dbo].[Customer] (${insertColumns.map((column) => `[${column}]`).join(", ")}) OUTPUT INSERTED.* VALUES (${insertColumns.map((column) => `@${column}`).join(", ")})`;
    const requestBuilder = pool.request();
    for (const column of insertColumns) {
      const value = insertMap[column];
      if (column === "DOB") requestBuilder.input(column, sql.Date, value);
      else if (["int", "bigint", "smallint", "tinyint"].includes(columns.get(column))) requestBuilder.input(column, sql.Int, Number(value) || 0);
      else requestBuilder.input(column, sql.NVarChar(255), String(value));
    }
    const result = await requestBuilder.query(insertQuery);
    return response.status(201).json({ message: "Customer created successfully.", customer: result.recordset[0] });
  } catch (error) {
    console.error("Customer creation failed:", error.message);
    return response.status(503).json({ message: "Unable to create customer right now." });
  }
});

app.get("/api/admin/payments", async (_request, response) => {
  try {
    const pool = await getDbPool();
    const result = await pool.request().query(`
      SELECT TOP (1000)
        p.[ID], p.[CustomerID], p.[PaymentMode], p.[Bank], p.[Branch],
        p.[ChequeNo], p.[ChequeDate], p.[ReceiptDate], p.[Amount], p.[Status],
        p.[FlatID], COALESCE(af.[UnitNo], CONVERT(NVARCHAR(50), p.[FlatID])) AS [UnitNo],
        COALESCE(p.[CustomerName], c.[CustomerName]) AS [CustomerName]
      FROM [dbo].[tb_Payment] p
      LEFT JOIN [dbo].[AssignFlat] af ON af.[AssignFlatID] = p.[FlatID]
      LEFT JOIN [dbo].[Customer] c ON c.[CustomerID] = p.[CustomerID]
      WHERE LTRIM(RTRIM(COALESCE(p.[Status], ''))) = 'Active'
      ORDER BY p.[ID] DESC
    `);
    return response.json(result.recordset);
  } catch (error) {
    console.error("Payment list fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load payments right now." });
  }
});

app.get("/api/admin/payment-quote", async (request, response) => {
  const flat = String(request.query.flat || "").trim();
  if (!flat) return response.status(400).json({ message: "Flat number is required." });
  try {
    await ensurePenaltyTable();
    const quote = await getPaymentQuote(await getDbPool(), flat, request.query.paymentDate || new Date());
    if (!quote) return response.status(404).json({ message: "Selected flat number was not found." });
    return response.json(quote);
  } catch (error) {
    console.error("Payment quote failed:", error.message);
    return response.status(503).json({ message: "Unable to calculate payment penalty right now." });
  }
});

app.post("/api/admin/payments", async (request, response) => {
  const flat = String(request.body?.flat || "").trim();
  const amount = Number(request.body?.amount);
  if (!flat || !Number.isFinite(amount) || amount <= 0) return response.status(400).json({ message: "Flat number and a valid amount are required." });

  try {
    const pool = await getDbPool();
    await ensurePenaltyTable();
    const receiptDate = request.body?.receiptDate ? new Date(request.body.receiptDate) : new Date();
    const quote = await getPaymentQuote(pool, flat, receiptDate);
    if (!quote) return response.status(400).json({ message: "Selected flat number was not found." });
    const selected = quote.selected;
    const paymentAmount = amount;
    const paymentMode = String(request.body?.paymentMode || "").trim();
    const now = new Date();
    const result = await pool.request()
      .input("CustomerID", sql.Int, Number(selected.CustomerID) || null)
      .input("PaymentMode", sql.NVarChar(100), paymentMode)
      .input("Bank", sql.NVarChar(100), String(request.body?.bank || ""))
      .input("Branch", sql.NVarChar(100), String(request.body?.branch || ""))
      .input("ChequeNo", sql.NVarChar(100), String(request.body?.chequeNo || ""))
      .input("ChequeDate", sql.DateTime, request.body?.chequeDate ? new Date(request.body.chequeDate) : null)
      .input("ReceiptDate", sql.DateTime, request.body?.receiptDate ? new Date(request.body.receiptDate) : now)
      .input("Amount", sql.Decimal(18, 2), paymentAmount)
      .input("CreatedBy", sql.Int, 1)
      .input("CreatedDate", sql.DateTime, now)
      .input("CreatedTime", sql.DateTime, now)
      .input("Status", sql.NVarChar(50), "Active")
      .input("FlatID", sql.Int, Number(selected.AssignFlatID))
      .input("FlaTypeID", sql.Int, Number(selected.FlatDetailID) || 0)
      .input("CustomerName", sql.NVarChar(255), String(request.body?.customerName || ""))
      .query(`
        INSERT INTO [dbo].[tb_Payment]
          ([CustomerID], [PaymentMode], [Bank], [Branch], [ChequeNo], [ChequeDate], [ReceiptDate], [Amount], [CreatedBy], [CreatedDate], [CreatedTime], [Status], [FlatID], [FlaTypeID], [CustomerName])
        OUTPUT INSERTED.*
        VALUES
          (@CustomerID, @PaymentMode, @Bank, @Branch, @ChequeNo, @ChequeDate, @ReceiptDate, @Amount, @CreatedBy, @CreatedDate, @CreatedTime, @Status, @FlatID, @FlaTypeID, @CustomerName)
      `);
    if (quote.bill) {
      await pool.request()
        .input("BillID", sql.Int, Number(quote.bill.ID))
        .input("FlatID", sql.Int, Number(selected.AssignFlatID))
        .input("DueDate", sql.Date, new Date(`${quote.dueDate}T00:00:00`))
        .input("PaymentDate", sql.Date, new Date(`${quote.paymentDate}T00:00:00`))
        .input("BaseAmount", sql.Decimal(18, 2), quote.baseAmount)
        .input("AnnualRate", sql.Decimal(5, 2), 18)
        .input("OverdueDays", sql.Int, quote.overdueDays)
        .input("PenaltyAmount", sql.Decimal(18, 2), quote.penaltyAmount)
        .input("TotalAmount", sql.Decimal(18, 2), quote.totalAmount)
        .input("PaymentID", sql.Int, Number(result.recordset[0].ID))
        .query(`
          INSERT INTO [dbo].[tb_ElectricityPenalty]
            ([BillID], [FlatID], [DueDate], [PaymentDate], [BaseAmount], [AnnualRate], [OverdueDays], [PenaltyAmount], [TotalAmount], [PaymentID], [Status])
          VALUES
            (@BillID, @FlatID, @DueDate, @PaymentDate, @BaseAmount, @AnnualRate, @OverdueDays, @PenaltyAmount, @TotalAmount, @PaymentID, N'Applied')
        `);
    }
    return response.status(201).json({ message: "Payment saved successfully.", payment: result.recordset[0], quote });
  } catch (error) {
    console.error("Payment save failed:", error.message);
    return response.status(503).json({ message: "Unable to save payment right now." });
  }
});

app.post("/api/admin/payments/import", async (request, response) => {
  const rows = request.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 5000) {
    return response.status(400).json({ message: "Upload a workbook containing between 1 and 5,000 payment rows." });
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (value) => {
    if (typeof value !== "string" || !datePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const normalizedRows = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;
    const flat = String(row?.flat || "").trim();
    const amount = Number(row?.amount);
    const amountCentsDifference = Math.abs(amount * 100 - Math.round(amount * 100));
    const chequeDate = row?.chequeDate ? String(row.chequeDate) : "";
    if (!flat || flat.length > 50 || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999999999 || amountCentsDifference > 1e-6 || !validDate(row?.receiptDate) || (chequeDate && !validDate(chequeDate))) {
      return response.status(400).json({ message: `Payment row ${rowNumber} has an invalid flat number, amount, or date.` });
    }

    const textFields = {
      paymentMode: [row?.paymentMode, 100],
      bank: [row?.bank, 100],
      branch: [row?.branch, 100],
      chequeNo: [row?.chequeNo, 100],
      customerName: [row?.customerName, 255],
    };
    for (const [field, [value, maxLength]] of Object.entries(textFields)) {
      if (String(value || "").length > maxLength) {
        return response.status(400).json({ message: `Payment row ${rowNumber} has a ${field} longer than ${maxLength} characters.` });
      }
    }
    normalizedRows.push({
      flat,
      amount,
      receiptDate: row.receiptDate,
      chequeDate,
      paymentMode: String(row?.paymentMode || "").trim(),
      bank: String(row?.bank || "").trim(),
      branch: String(row?.branch || "").trim(),
      chequeNo: String(row?.chequeNo || "").trim(),
      customerName: String(row?.customerName || "").trim(),
    });
  }

  let transaction;
  try {
    const pool = await getDbPool();
    const flatResult = await pool.request().query(`
      SELECT af.[AssignFlatID], af.[CustomerID], af.[FlatDetailID], af.[UnitNo], c.[CustomerName]
      FROM [dbo].[AssignFlat] af
      LEFT JOIN [dbo].[Customer] c ON c.[CustomerID] = af.[CustomerID]
      WHERE af.[UnitNo] IS NOT NULL
      ORDER BY af.[AssignFlatID]
    `);
    const flatsByUnit = new Map();
    for (const flat of flatResult.recordset) {
      const key = String(flat.UnitNo || "").trim().toLowerCase();
      if (key && !flatsByUnit.has(key)) flatsByUnit.set(key, flat);
    }
    const unresolved = normalizedRows
      .map((row, index) => ({ row, rowNumber: index + 1 }))
      .filter(({ row }) => !flatsByUnit.has(row.flat.toLowerCase()));
    if (unresolved.length) {
      const samples = unresolved.slice(0, 10).map(({ row, rowNumber }) => `row ${rowNumber}: ${row.flat}`).join(", ");
      const remaining = unresolved.length - 10;
      return response.status(400).json({
        message: `${unresolved.length} unit number${unresolved.length === 1 ? "" : "s"} did not match an assigned flat (${samples}${remaining ? `, and ${remaining} more` : ""}). No payments were saved.`,
      });
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const now = new Date();
    for (let offset = 0; offset < normalizedRows.length; offset += 100) {
      const batch = normalizedRows.slice(offset, offset + 100);
      const fieldNames = ["CustomerID", "PaymentMode", "Bank", "Branch", "ChequeNo", "ChequeDate", "ReceiptDate", "Amount", "CreatedBy", "CreatedDate", "CreatedTime", "Status", "FlatID", "FlaTypeID", "CustomerName"];
      const values = batch.map((_, rowIndex) => `(${fieldNames.map((field) => `@${field}${rowIndex}`).join(", ")})`).join(", ");
      const insert = new sql.Request(transaction);
      batch.forEach((row, rowIndex) => {
        const flat = flatsByUnit.get(row.flat.toLowerCase());
        const customerName = row.customerName || String(flat.CustomerName || "");
        insert
          .input(`CustomerID${rowIndex}`, sql.Int, Number(flat.CustomerID) || null)
          .input(`PaymentMode${rowIndex}`, sql.NVarChar(100), row.paymentMode)
          .input(`Bank${rowIndex}`, sql.NVarChar(100), row.bank)
          .input(`Branch${rowIndex}`, sql.NVarChar(100), row.branch)
          .input(`ChequeNo${rowIndex}`, sql.NVarChar(100), row.chequeNo)
          .input(`ChequeDate${rowIndex}`, sql.DateTime, row.chequeDate ? new Date(`${row.chequeDate}T00:00:00`) : null)
          .input(`ReceiptDate${rowIndex}`, sql.DateTime, new Date(`${row.receiptDate}T00:00:00`))
          .input(`Amount${rowIndex}`, sql.Decimal(18, 2), row.amount)
          .input(`CreatedBy${rowIndex}`, sql.Int, 1)
          .input(`CreatedDate${rowIndex}`, sql.DateTime, now)
          .input(`CreatedTime${rowIndex}`, sql.DateTime, now)
          .input(`Status${rowIndex}`, sql.NVarChar(50), "Active")
          .input(`FlatID${rowIndex}`, sql.Int, Number(flat.AssignFlatID))
          .input(`FlaTypeID${rowIndex}`, sql.Int, Number(flat.FlatDetailID) || 0)
          .input(`CustomerName${rowIndex}`, sql.NVarChar(255), customerName);
      });
      await insert.query(`
        INSERT INTO [dbo].[tb_Payment]
          ([CustomerID], [PaymentMode], [Bank], [Branch], [ChequeNo], [ChequeDate], [ReceiptDate], [Amount], [CreatedBy], [CreatedDate], [CreatedTime], [Status], [FlatID], [FlaTypeID], [CustomerName])
        VALUES ${values}
      `);
    }
    await transaction.commit();
    const months = new Set(normalizedRows.map((row) => row.receiptDate.slice(0, 7)));
    return response.status(201).json({ message: "Monthly payments saved successfully.", saved: normalizedRows.length, months: months.size });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error("Monthly payment import failed:", error.message);
    return response.status(503).json({ message: "Unable to save monthly payments right now. No payments were saved." });
  }
});

app.put("/api/admin/payments/:id", async (request, response) => {
  const paymentId = Number(request.params.id);
  const flat = String(request.body?.flat || "").trim();
  const amount = Number(request.body?.amount);
  if (!Number.isInteger(paymentId) || !flat || !Number.isFinite(amount) || amount <= 0) {
    return response.status(400).json({ message: "Payment, flat number, and a valid amount are required." });
  }

  try {
    const pool = await getDbPool();
    const assignedFlat = await pool.request()
      .input("flat", sql.NVarChar(50), flat)
      .query(`SELECT TOP (1) [AssignFlatID], [CustomerID] FROM [dbo].[AssignFlat] WHERE [UnitNo] = @flat OR CONVERT(NVARCHAR(50), [AssignFlatID]) = @flat ORDER BY [AssignFlatID]`);
    if (!assignedFlat.recordset.length) return response.status(400).json({ message: "Selected flat number was not found." });

    const selected = assignedFlat.recordset[0];
    const result = await pool.request()
      .input("id", sql.Int, paymentId)
      .input("CustomerID", sql.Int, Number(selected.CustomerID) || null)
      .input("PaymentMode", sql.NVarChar(100), String(request.body?.paymentMode || ""))
      .input("Bank", sql.NVarChar(100), String(request.body?.bank || ""))
      .input("Branch", sql.NVarChar(100), String(request.body?.branch || ""))
      .input("ChequeNo", sql.NVarChar(100), String(request.body?.chequeNo || ""))
      .input("ChequeDate", sql.DateTime, request.body?.chequeDate ? new Date(request.body.chequeDate) : null)
      .input("ReceiptDate", sql.DateTime, request.body?.receiptDate ? new Date(request.body.receiptDate) : new Date())
      .input("Amount", sql.Decimal(18, 2), amount)
      .input("FlatID", sql.Int, Number(selected.AssignFlatID))
      .input("CustomerName", sql.NVarChar(255), String(request.body?.customerName || ""))
      .query(`
        UPDATE [dbo].[tb_Payment]
        SET [CustomerID] = @CustomerID, [PaymentMode] = @PaymentMode, [Bank] = @Bank,
            [Branch] = @Branch, [ChequeNo] = @ChequeNo, [ChequeDate] = @ChequeDate,
            [ReceiptDate] = @ReceiptDate, [Amount] = @Amount, [FlatID] = @FlatID,
            [CustomerName] = @CustomerName
        OUTPUT INSERTED.*
        WHERE [ID] = @id
      `);
    if (!result.recordset.length) return response.status(404).json({ message: "Payment record not found." });
    return response.json({ message: "Payment updated successfully.", payment: result.recordset[0] });
  } catch (error) {
    console.error("Payment update failed:", error.message);
    return response.status(503).json({ message: "Unable to update payment right now." });
  }
});

app.delete("/api/admin/payments/:id", async (request, response) => {
  const paymentId = Number(request.params.id);
  if (!Number.isInteger(paymentId)) return response.status(400).json({ message: "Invalid payment ID." });
  try {
    const pool = await getDbPool();
    const result = await pool.request().input("id", sql.Int, paymentId).query("DELETE FROM [dbo].[tb_Payment] OUTPUT DELETED.[ID] WHERE [ID] = @id");
    if (!result.recordset.length) return response.status(404).json({ message: "Payment record not found." });
    return response.json({ message: "Payment deleted successfully." });
  } catch (error) {
    console.error("Payment delete failed:", error.message);
    return response.status(503).json({ message: "Unable to delete payment right now." });
  }
});

app.get("/api/bill-rates", async (_request, response) => {
  try {
    const pool = await getDbPool();
    await ensureChargeMasterTable();
    const slabs = await pool.request().query(`
      SELECT [UnitSlab1], [UnitSlab2], [Rate], [Charge], [Order]
      FROM [dbo].[Tb_unit_slab]
      WHERE LTRIM(RTRIM([Status])) = 'Active'
      ORDER BY [Order]
    `);
    const fixed = await pool.request().query(`
      SELECT [NAme], [Monthly_Amount]
      FROM [dbo].[Tb_chareges]
      WHERE LTRIM(RTRIM([Status])) = 'Active'
        AND [NAme] IN ('Water fixed charges', 'Common Area electricity charges', 'Fixed Electricity Charges')
    `);
    const masters = await pool.request().query(`
      SELECT [ID], [MasterType], [Amount]
      FROM [dbo].[ElectricityChargeMaster]
      WHERE [Status] = 'Active'
        AND [ID] IN (
          SELECT MAX([ID])
          FROM [dbo].[ElectricityChargeMaster]
          WHERE [Status] = 'Active'
          GROUP BY [MasterType]
        )
    `);
    return response.json({ slabs: slabs.recordset, fixedCharges: fixed.recordset, masters: masters.recordset });
  } catch (error) {
    console.error("Bill rates fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load bill rates right now." });
  }
});

app.get("/api/admin/charge-masters", async (request, response) => {
  try {
    await ensureChargeMasterTable();
    const masterType = String(request.query.type || "").trim();
    const pool = await getDbPool();
    const builder = pool.request();
    let query = "SELECT [ID], [MasterType], [Name], [AliasName], [Amount], [Status], [CreatedDate] FROM [dbo].[ElectricityChargeMaster]";
    if (masterType) { builder.input("masterType", sql.NVarChar(80), masterType); query += " WHERE [MasterType] = @masterType"; }
    query += " ORDER BY [ID] DESC";
    return response.json((await builder.query(query)).recordset);
  } catch (error) {
    console.error("Charge master list failed:", error.message);
    return response.status(503).json({ message: "Unable to load charge masters right now." });
  }
});

app.post("/api/admin/charge-masters", async (request, response) => {
  const masterType = String(request.body?.masterType || "").trim();
  const name = masterType;
  const amount = Number(request.body?.amount);
  if (!masterType || !Number.isFinite(amount)) return response.status(400).json({ message: "Master type and amount are required." });
  try {
    await ensureChargeMasterTable();
    const result = await (await getDbPool()).request()
      .input("masterType", sql.NVarChar(80), masterType)
      .input("name", sql.NVarChar(150), name)
      .input("aliasName", sql.NVarChar(100), null)
      .input("amount", sql.Decimal(18, 2), amount)
      .query(`INSERT INTO [dbo].[ElectricityChargeMaster] ([MasterType], [Name], [AliasName], [Amount]) OUTPUT INSERTED.* VALUES (@masterType, @name, @aliasName, @amount)`);
    return response.status(201).json({ message: "Master saved successfully.", master: result.recordset[0] });
  } catch (error) {
    console.error("Charge master save failed:", error.message);
    return response.status(503).json({ message: "Unable to save charge master right now." });
  }
});

app.put("/api/admin/charge-masters/:id", async (request, response) => {
  const id = Number(request.params.id);
  const amount = Number(request.body?.amount);
  if (!Number.isInteger(id) || !Number.isFinite(amount)) return response.status(400).json({ message: "Valid master ID and amount are required." });
  try {
    await ensureChargeMasterTable();
    const pool = await getDbPool();
    const updateResult = await pool.request()
      .input("id", sql.Int, id)
      .input("amount", sql.Decimal(18, 2), amount)
      .query("UPDATE [dbo].[ElectricityChargeMaster] SET [Amount] = @amount WHERE [ID] = @id");
    if (!updateResult.rowsAffected[0]) return response.status(404).json({ message: "Master record not found." });
    const result = await pool.request().input("id", sql.Int, id).query("SELECT * FROM [dbo].[ElectricityChargeMaster] WHERE [ID] = @id");
    return response.json({ message: "Master amount updated successfully.", master: result.recordset[0] });
  } catch (error) {
    console.error("Charge master update failed:", error.message);
    return response.status(503).json({ message: "Unable to update master amount right now." });
  }
});

app.delete("/api/admin/charge-masters/:id", async (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return response.status(400).json({ message: "Invalid master ID." });
  try {
    await ensureChargeMasterTable();
    const result = await (await getDbPool()).request().input("id", sql.Int, id).query("DELETE FROM [dbo].[ElectricityChargeMaster] OUTPUT DELETED.[ID] WHERE [ID] = @id");
    if (!result.recordset.length) return response.status(404).json({ message: "Master record not found." });
    return response.json({ message: "Master record deleted successfully." });
  } catch (error) {
    console.error("Charge master delete failed:", error.message);
    return response.status(503).json({ message: "Unable to delete master right now." });
  }
});

// Used by the Generate Bill searchable flat-number field. UnitNo is the
// displayed flat number from dbo.AssignFlat (for example, A-1204).
app.get("/api/assigned-flats", async (request, response) => {
  const search = String(request.query.search || "").trim();
  const billDate = String(request.query.billDate || "").trim();
  const dateParts = billDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const checkedBillDate = dateParts ? new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))) : null;
  if (billDate && (!dateParts
    || checkedBillDate.getUTCFullYear() !== Number(dateParts[1])
    || checkedBillDate.getUTCMonth() + 1 !== Number(dateParts[2])
    || checkedBillDate.getUTCDate() !== Number(dateParts[3]))) {
    return response.status(400).json({ message: "A valid bill date is required." });
  }

  try {
    const pool = await getDbPool();
    const result = await pool.request()
      .input("search", sql.NVarChar(50), `%${search}%`)
      .input("billDate", sql.DateTime, billDate ? new Date(`${billDate}T00:00:00`) : null)
      .query(`
        SELECT DISTINCT
          [AssignFlat].[AssignFlatID], [AssignFlat].[CustomerID], [AssignFlat].[UnitNo],
          customer_details.[CustomerName] AS [customerName],
          customer_details.[Address] AS [address],
          customer_details.[ContactNo] AS [phone],
          bill_details.[MeterNumber] AS [meter],
          bill_details.[Load] AS [load],
          outstanding_details.[Amount] AS [previousBalance],
          bill_balance.[BillCount] AS [billCount],
          CASE
            WHEN COALESCE(penalty_details.[PenaltyAmount], 0) > 0
            THEN COALESCE(penalty_details.[PenaltyAmount], 0)
            WHEN COALESCE(bill_details.[penalty], 0) > 0
              AND LTRIM(RTRIM(COALESCE(bill_details.[Status], ''))) <> 'Paid'
            THEN COALESCE(bill_details.[penalty], 0)
            WHEN COALESCE(outstanding_details.[Amount], 0) > 0
              AND bill_details.[DueDate] < CAST(GETDATE() AS DATE)
              AND LTRIM(RTRIM(COALESCE(bill_details.[Status], ''))) <> 'Paid'
            THEN ROUND(COALESCE(outstanding_details.[Amount], 0) * 0.18 * DATEDIFF(DAY, bill_details.[DueDate], CAST(GETDATE() AS DATE)) / 365.0, 2)
            ELSE 0
          END AS [previousPenalty]
        FROM [dbo].[AssignFlat]
        LEFT JOIN [dbo].[Customer] AS customer_details
          ON customer_details.[CustomerID] = [AssignFlat].[CustomerID]
        OUTER APPLY (
          SELECT TOP (1)
            COALESCE(NULLIF([MeterNumber], ''), [MeeterNumber]) AS [MeterNumber],
            [Load], [DueDate], [Status], [penalty]
          FROM [dbo].[tb_ElectricBill]
          WHERE [FlatID] = [AssignFlat].[AssignFlatID]
              AND (@billDate IS NULL OR [BillDate] < @billDate)
            ORDER BY [Id] DESC
        ) AS bill_details
        OUTER APPLY (
            SELECT
              COUNT(*) AS [BillCount],
              SUM(CASE
                WHEN COALESCE([TotalPaidAmount], 0) > 0
                THEN [TotalPaidAmount] - COALESCE([PreviousBalance], 0)
              ELSE COALESCE(NULLIF([RateAmount], 0), NULLIF([ChargeAmount], 0), [Charge], 0)
                + COALESCE([DGAmount], 0)
                + COALESCE([FuelSearchCharge], 0)
                + COALESCE([CTDTRent], 0)
                + COALESCE([DutyCharge], 0)
                + COALESCE(NULLIF([FixedCharge], 0), [MiscCharge], 0)
                + COALESCE([OtherCharge], 0)
                + COALESCE([penalty], 0)
                - COALESCE([Discount], 0)
            END) AS [BilledCharges]
          FROM [dbo].[tb_ElectricBill]
          WHERE [FlatID] = [AssignFlat].[AssignFlatID]
            AND (@billDate IS NULL OR [BillDate] < @billDate)
        ) AS bill_balance
        OUTER APPLY (
          SELECT TOP (1)
            COALESCE([PreviousBalance], 0) AS [OpeningBalance],
            [BillDate] AS [OpeningBillDate]
          FROM [dbo].[tb_ElectricBill]
          WHERE [FlatID] = [AssignFlat].[AssignFlatID]
              AND (@billDate IS NULL OR [BillDate] < @billDate)
            ORDER BY [BillDate], [ID]
        ) AS first_bill
        OUTER APPLY (
          SELECT SUM(COALESCE([Amount], 0)) AS [PaidAmount]
          FROM [dbo].[tb_Payment]
          WHERE TRY_CONVERT(INT, [FlatID]) = [AssignFlat].[AssignFlatID]
            AND LTRIM(RTRIM(COALESCE([Status], ''))) = 'Active'
            AND [ReceiptDate] >= first_bill.[OpeningBillDate]
            AND (@billDate IS NULL OR [ReceiptDate] < DATEADD(DAY, 1, @billDate))
        ) AS payment_balance
        OUTER APPLY (
          SELECT TOP (1) [Amount]
          FROM [dbo].[Tb_Electricity_priviousBalance]
          WHERE [FlatID] = [AssignFlat].[AssignFlatID]
          ORDER BY [Id] DESC
        ) AS balance_details
        OUTER APPLY (
          SELECT CASE
            WHEN bill_balance.[BillCount] > 0 THEN
              CASE
                WHEN COALESCE(first_bill.[OpeningBalance], 0)
                  + COALESCE(bill_balance.[BilledCharges], 0)
                  - COALESCE(payment_balance.[PaidAmount], 0) > 0
                THEN COALESCE(first_bill.[OpeningBalance], 0)
                  + COALESCE(bill_balance.[BilledCharges], 0)
                  - COALESCE(payment_balance.[PaidAmount], 0)
                ELSE 0
              END
            ELSE COALESCE(balance_details.[Amount], 0)
          END AS [Amount]
        ) AS outstanding_details
        OUTER APPLY (
          SELECT TOP (1) [PenaltyAmount]
          FROM [dbo].[tb_ElectricityPenalty]
          WHERE [FlatID] = [AssignFlat].[AssignFlatID]
            AND LTRIM(RTRIM(COALESCE([Status], ''))) = 'Applied'
          ORDER BY [PenaltyID] DESC
        ) AS penalty_details
        WHERE [AssignFlat].[UnitNo] IS NOT NULL
          AND LTRIM(RTRIM([AssignFlat].[UnitNo])) <> ''
          AND [AssignFlat].[UnitNo] LIKE @search
        ORDER BY [AssignFlat].[UnitNo]
      `);

    return response.json(result.recordset);
  } catch (error) {
    console.error("Assigned flat fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load flat numbers right now." });
  }
});

app.get("/api/admin/flat-master", async (request, response) => {
  const search = String(request.query.search || "").trim();

  try {
    const pool = await getDbPool();
    const result = await pool.request()
      .input("search", sql.NVarChar(100), `%${search}%`)
      .query(`
        SELECT TOP (1000)
          af.[AssignFlatID], af.[CustomerID], af.[UnitNo], af.[FlatDetailID],
          af.[FloorNo] AS [AssignedFloorNo], af.[FlatAmount], af.[BookingDate],
          af.[Status] AS [FlatStatus], af.[BlockID], af.[AdditionalAmount], af.[arrears],
          c.[CustomerNo], c.[CustomerName], c.[Address], c.[ContactNo], c.[Mobile],
          fd.[FlatTypeID], fd.[FlatView], fd.[FloorNo], fd.[Status] AS [DetailStatus],
          ft.[FlatTypeName], ft.[Area], ft.[Status] AS [TypeStatus]
        FROM [dbo].[AssignFlat] af
        LEFT JOIN [dbo].[Customer] c ON c.[CustomerID] = af.[CustomerID]
        LEFT JOIN [dbo].[FlatDetail] fd ON fd.[FlatDetailID] = af.[FlatDetailID]
        LEFT JOIN [dbo].[FlatType] ft ON ft.[FlatTypeID] = fd.[FlatTypeID]
          WHERE COALESCE(CONVERT(NVARCHAR(100), af.[UnitNo]), '') LIKE @search
           OR COALESCE(c.[CustomerName], '') LIKE @search
            OR COALESCE(CONVERT(NVARCHAR(100), c.[CustomerNo]), '') LIKE @search
        ORDER BY af.[UnitNo], c.[CustomerName]
      `);

    return response.json(result.recordset);
  } catch (error) {
    console.error("Flat master fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load flat master right now." });
  }
});

app.post("/api/admin/flat-master/arrears-import", async (request, response) => {
  const rows = request.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
    return response.status(400).json({ message: "Upload a workbook containing between 1 and 1000 flat rows." });
  }

  const seenIds = new Set();
  for (const row of rows) {
    const id = Number(row?.id);
    const arrears = Number(row?.arrears);
    const centsDifference = Math.abs(arrears * 100 - Math.round(arrears * 100));
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(arrears) || arrears < 0 || arrears > 9999999999999999 || centsDifference > 1e-8) {
      return response.status(400).json({ message: "Each row needs a valid ID and non-negative arrears amount with up to 2 decimal places." });
    }
    if (seenIds.has(id)) return response.status(400).json({ message: `ID ${id} appears more than once in the workbook.` });
    seenIds.add(id);
  }

  let transaction;
  try {
    const pool = await getDbPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    let updatedCount = 0;
    for (let offset = 0; offset < rows.length; offset += 500) {
      const batch = rows.slice(offset, offset + 500);
      const values = batch.map((_, index) => `(@id${index}, @arrears${index})`).join(", ");
      const update = new sql.Request(transaction);
      batch.forEach((row, index) => {
        update
          .input(`id${index}`, sql.Int, Number(row.id))
          .input(`arrears${index}`, sql.Decimal(18, 2), Number(row.arrears));
      });
      const result = await update.query(`
        UPDATE af
        SET af.[arrears] = imported.[Arrears]
        OUTPUT INSERTED.[AssignFlatID]
        FROM [dbo].[AssignFlat] af
        INNER JOIN (VALUES ${values}) AS imported([AssignFlatID], [Arrears])
          ON imported.[AssignFlatID] = af.[AssignFlatID]
      `);
      updatedCount += result.recordset.length;
      if (result.recordset.length !== batch.length) {
        await transaction.rollback();
        return response.status(400).json({ message: "A flat ID does not exist in the database. No arrears were changed." });
      }
    }

    await transaction.commit();
    return response.json({ message: "Arrears updated successfully.", updated: updatedCount });
  } catch (error) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error("Flat arrears import failed:", error.message);
    return response.status(503).json({ message: "Unable to update flat arrears right now." });
  }
});

app.get("/api/admin/flat-master/options", async (_request, response) => {
  try {
    const pool = await getDbPool();
    const customers = await pool.request().query(`
      SELECT [CustomerID], [CustomerNo], [CustomerName], [Address], [ContactNo], [Mobile]
      FROM [dbo].[Customer]
      WHERE LTRIM(RTRIM(COALESCE([Status], ''))) NOT IN ('Inactive', 'Deleted')
      ORDER BY [CustomerName], [CustomerNo]
    `);
    const flatDetails = await pool.request().query(`
      SELECT fd.[FlatDetailID], fd.[BlockID], fd.[FlatTypeID], fd.[FlatView], fd.[FloorNo],
             fd.[Status], ft.[FlatTypeName], ft.[Area]
      FROM [dbo].[FlatDetail] fd
      LEFT JOIN [dbo].[FlatType] ft ON ft.[FlatTypeID] = fd.[FlatTypeID]
      WHERE LTRIM(RTRIM(COALESCE(fd.[Status], ''))) NOT IN ('Inactive', 'Deleted')
      ORDER BY fd.[BlockID], fd.[FloorNo], ft.[FlatTypeName]
    `);
    return response.json({ customers: customers.recordset, flatDetails: flatDetails.recordset });
  } catch (error) {
    console.error("Flat master options failed:", error.message);
    return response.status(503).json({ message: "Unable to load flat master options right now." });
  }
});

app.post("/api/admin/flat-master", async (request, response) => {
  const customerId = Number(request.body?.customerId);
  const unitNo = String(request.body?.unitNo || "").trim();
  const flatDetailId = Number(request.body?.flatDetailId);
  const floorNo = Number(request.body?.floorNo);
  const blockId = Number(request.body?.blockId);
  const flatAmount = Number(request.body?.flatAmount || 0);
  const additionalAmount = Number(request.body?.additionalAmount || 0);
  const arrears = Number(request.body?.arrears || 0);
  const bookingDate = String(request.body?.bookingDate || "").trim();
  const status = String(request.body?.status || "Active").trim() || "Active";

  if (!Number.isInteger(customerId) || !unitNo || !Number.isInteger(flatDetailId) || !Number.isFinite(floorNo) || !Number.isFinite(blockId) || !bookingDate) {
    return response.status(400).json({ message: "Customer, flat number, flat detail, floor, block, and booking date are required." });
  }

  try {
    const pool = await getDbPool();
    const result = await pool.request()
      .input("customerId", sql.Int, customerId)
      .input("unitNo", sql.NVarChar(100), unitNo)
      .input("flatDetailId", sql.Int, flatDetailId)
      .input("floorNo", sql.Int, Math.trunc(floorNo))
      .input("flatAmount", sql.Decimal(18, 2), Number.isFinite(flatAmount) ? flatAmount : 0)
      .input("bookingDate", sql.Date, bookingDate)
      .input("status", sql.NVarChar(50), status)
      .input("blockId", sql.Int, Math.trunc(blockId))
      .input("additionalAmount", sql.Decimal(18, 2), Number.isFinite(additionalAmount) ? additionalAmount : 0)
      .input("arrears", sql.Decimal(18, 2), Number.isFinite(arrears) ? arrears : 0)
      .query(`
        INSERT INTO [dbo].[AssignFlat]
          ([CustomerID], [UnitNo], [FlatDetailID], [FloorNo], [FlatAmount], [BookingDate], [Status], [BlockID], [AdditionalAmount], [arrears])
        OUTPUT INSERTED.*
        VALUES (@customerId, @unitNo, @flatDetailId, @floorNo, @flatAmount, @bookingDate, @status, @blockId, @additionalAmount, @arrears)
      `);
    return response.status(201).json({ message: "Flat assigned successfully.", flat: result.recordset[0] });
  } catch (error) {
    console.error("Flat assignment failed:", error.message);
    return response.status(503).json({ message: "Unable to assign flat right now." });
  }
});

app.get("/api/flat-penalty/:flatId", async (request, response) => {
  const flatId = Number(request.params.flatId);
  if (!Number.isInteger(flatId)) return response.status(400).json({ message: "Invalid flat ID." });

  try {
    const pool = await getDbPool();
    const result = await pool.request()
      .input("flatId", sql.Int, flatId)
      .query(`
        SELECT TOP (1) [PenaltyAmount]
        FROM [dbo].[tb_ElectricityPenalty]
        WHERE [FlatID] = @flatId
        ORDER BY [PenaltyID] DESC
      `);
    return response.json({ penaltyAmount: Number(result.recordset[0]?.PenaltyAmount || 0) });
  } catch (error) {
    console.error("Flat penalty fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load flat penalty right now." });
  }
});


app.post("/api/bills", async (request, response) => {
  const payload = normalizeBillPayload(request.body || {});

  if (!payload.MeterNumber || !payload.FlatID) {
    return response.status(400).json({ message: "Meter number and flat number are required." });
  }

  try {
    await ensureElectricBillTable();
    const pool = await getDbPool();
    await pool.request().query(`
      IF OBJECT_ID(N'[dbo].[tb_BillReceiptCounter]', N'U') IS NULL
      BEGIN
        CREATE TABLE [dbo].[tb_BillReceiptCounter] ([CounterID] INT NOT NULL PRIMARY KEY, [NextValue] INT NOT NULL);
      END;
      IF NOT EXISTS (SELECT 1 FROM [dbo].[tb_BillReceiptCounter] WITH (UPDLOCK, HOLDLOCK) WHERE [CounterID] = 1)
        INSERT INTO [dbo].[tb_BillReceiptCounter] ([CounterID], [NextValue]) VALUES (1, 1);
    `);
    const receiptNumberResult = await pool.request().query(`
      UPDATE [dbo].[tb_BillReceiptCounter] WITH (UPDLOCK, ROWLOCK)
      SET [NextValue] = [NextValue] + 1
      OUTPUT DELETED.[NextValue] AS [ReceiptNumber]
      WHERE [CounterID] = 1;
    `);
    const receiptNumber = String(receiptNumberResult.recordset[0].ReceiptNumber).padStart(3, "0");
    let databaseFlatId = payload.FlatID;
    let databaseCustomerId = payload.CustomerID;
    if (!/^\d+$/.test(String(payload.FlatID))) {
      const assignedFlat = await pool.request()
        .input("unitNo", sql.NVarChar(50), payload.FlatID)
        .query(`
          SELECT TOP (1) [AssignFlatID], [CustomerID]
          FROM [dbo].[AssignFlat]
          WHERE [UnitNo] = @unitNo
          ORDER BY [AssignFlatID]
        `);
      if (!assignedFlat.recordset.length) {
        return response.status(400).json({ message: "Selected flat number was not found." });
      }
      databaseFlatId = assignedFlat.recordset[0].AssignFlatID;
      databaseCustomerId = assignedFlat.recordset[0].CustomerID || databaseCustomerId;
    }
    await applyCalculatedArrears(pool, databaseFlatId, payload.BillDate, payload);
    const existingColumns = await pool.request().query(`
      SELECT c.name AS column_name, ty.name AS data_type
      FROM sys.columns c
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE t.name = 'tb_ElectricBill'
    `);
    const columnNames = new Set((existingColumns.recordset || []).map((row) => row.column_name));
    const columnTypes = new Map((existingColumns.recordset || []).map((row) => [row.column_name, row.data_type]));
    const integerValue = (value, fallback = 1) => {
      const parsed = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
      if (!Number.isFinite(parsed)) return fallback;
      return parsed > 2147483646 ? (parsed % 2147483646) + 1 : parsed;
    };

    const insertMap = {
      FlatID: databaseFlatId,
      CustomerID: databaseCustomerId,
      BillDate: payload.BillDate,
      DueDate: payload.DueDate,
      FromDate: payload.FromDate,
      ToDate: payload.ToDate,
      Unit: payload.Unit,
      Charge: payload.Charge,
      CreatedBy: columnTypes.get("CreatedBy") === "int" ? integerValue(payload.CreatedBy) : payload.CreatedBy,
      CreatedDate: payload.CreatedDate,
      CreatedTime: payload.CreatedTime,
      ModifiedBy: payload.ModifiedBy,
      ModifiedDate: payload.ModifiedDate,
      ModifiedTime: payload.ModifiedTime,
      Status: payload.Status,
      ReceiptID: columnTypes.get("ReceiptID") === "int" ? Number(receiptNumber) : receiptNumber,
      ChargeAmount: payload.ChargeAmount,
      RateAmount: payload.RateAmount,
      FuelSearchCharge: payload.FuelSearchCharge,
      CTDTRent: payload.CTDTRent,
      DutyCharge: payload.DutyCharge,
      PreviousBalance: payload.PreviousBalance,
      TotalPaidAmount: payload.TotalPaidAmount,
      penalty: payload.penalty,
      Discount: payload.Discount,
      MiscCharge: payload.FixedCharge,
      FixedCharge: payload.FixedCharge,
      OtherCharge: payload.OtherCharge,
      Load: payload.Load,
      MeterNumber: payload.MeterNumber,
      MeeterNumber: payload.MeeterNumber,
      CustomerName: payload.CustomerName,
      Address: payload.Address,
      DGUnit: payload.DGUnit,
      DGCharge: payload.DGCharge,
      DGAmount: payload.DGAmount,
      PriviousBalance: payload.PriviousBalance,
      Remarks: payload.Remarks,
    };

    const insertColumns = Object.keys(insertMap).filter((column) => columnNames.has(column) && insertMap[column] !== undefined && insertMap[column] !== null && insertMap[column] !== "");
    const insertQuery = `
      INSERT INTO [dbo].[tb_ElectricBill] (
        ${insertColumns.map((column) => `[${column}]`).join(", ")}
      )
      OUTPUT INSERTED.*
      VALUES (
        ${insertColumns.map((column) => `@${column}`).join(", ")}
      )
    `;

    const requestBuilder = pool.request();
    for (const column of insertColumns) {
      const value = insertMap[column];
      if (column.includes("Date") || column.includes("Time")) {
        const dateValue = value instanceof Date ? value : new Date(value);
        requestBuilder.input(column, sql.DateTime, Number.isNaN(dateValue.getTime()) ? new Date("1970-01-01T00:00:00") : dateValue);
      } else if (["FlatID", "CustomerID", "CreatedBy", "ModifiedBy", "ReceiptID"].includes(column)) {
        requestBuilder.input(column, sql.Int, Number(value));
      } else if (["Unit", "Charge", "ChargeAmount", "RateAmount", "FuelSearchCharge", "CTDTRent", "DutyCharge", "PreviousBalance", "TotalPaidAmount", "penalty", "Discount", "MiscCharge", "FixedCharge", "OtherCharge", "DGUnit", "DGCharge", "DGAmount", "PriviousBalance"].includes(column)) {
        requestBuilder.input(column, sql.Decimal(10, 2), Number(value));
      } else {
        requestBuilder.input(column, sql.NVarChar(255), String(value));
      }
    }

    const result = await requestBuilder.query(insertQuery);
    const savedBill = result.recordset[0];
    const balanceAmount = Number(payload.TotalPaidAmount || payload.ChargeAmount || 0);
    const balanceRow = await pool.request()
      .input("balanceFlatId", sql.Int, Number(databaseFlatId))
      .query("SELECT TOP (1) [Id] FROM [dbo].[Tb_Electricity_priviousBalance] WHERE [FlatID] = @balanceFlatId");
    if (balanceRow.recordset.length) {
      await pool.request()
        .input("balanceFlatId", sql.Int, Number(databaseFlatId))
        .input("balanceAmount", sql.Decimal(18, 2), balanceAmount)
        .query("UPDATE [dbo].[Tb_Electricity_priviousBalance] SET [Amount] = @balanceAmount WHERE [FlatID] = @balanceFlatId");
    } else {
      await pool.request()
        .input("balanceFlatId", sql.Int, Number(databaseFlatId))
        .input("balanceAmount", sql.Decimal(18, 2), balanceAmount)
        .query("INSERT INTO [dbo].[Tb_Electricity_priviousBalance] ([FlatID], [Amount]) VALUES (@balanceFlatId, @balanceAmount)");
    }
    return response.status(201).json({ message: "Bill saved successfully.", bill: savedBill });
  } catch (error) {
    console.error("Bill save failed:", error.message);
    return response.status(503).json({ message: "Unable to save the bill right now." });
  }
});

app.put("/api/bills/:id", async (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id <= 0) return response.status(400).json({ message: "A valid bill ID is required." });
  const payload = normalizeBillPayload(request.body || {});
  if (!payload.MeterNumber) return response.status(400).json({ message: "Meter number is required." });
  try {
    await ensureElectricBillTable();
    const pool = await getDbPool();
    const existingBill = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT TOP (1) [FlatID] FROM [dbo].[tb_ElectricBill] WHERE [ID] = @id");
    if (!existingBill.recordset.length) return response.status(404).json({ message: "Bill not found." });
    await applyCalculatedArrears(pool, existingBill.recordset[0].FlatID, payload.BillDate, payload, id);
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("BillDate", sql.Date, payload.BillDate)
      .input("DueDate", sql.Date, payload.DueDate)
      .input("FromDate", sql.Date, payload.FromDate)
      .input("ToDate", sql.Date, payload.ToDate)
      .input("Unit", sql.Decimal(10, 2), payload.Unit)
      .input("Charge", sql.Decimal(10, 2), payload.Charge)
      .input("RateAmount", sql.Decimal(10, 2), payload.RateAmount)
      .input("FuelSearchCharge", sql.Decimal(10, 2), payload.FuelSearchCharge)
      .input("CTDTRent", sql.Decimal(10, 2), payload.CTDTRent)
      .input("DutyCharge", sql.Decimal(10, 2), payload.DutyCharge)
      .input("DGUnit", sql.Decimal(10, 2), payload.DGUnit)
      .input("DGCharge", sql.Decimal(10, 2), payload.DGCharge)
      .input("PreviousBalance", sql.Decimal(10, 2), payload.PreviousBalance)
      .input("penalty", sql.Decimal(10, 2), payload.penalty)
      .input("Discount", sql.Decimal(10, 2), payload.Discount)
      .input("FixedCharge", sql.Decimal(10, 2), payload.FixedCharge)
      .input("OtherCharge", sql.Decimal(10, 2), payload.OtherCharge)
      .input("ChargeAmount", sql.Decimal(10, 2), payload.ChargeAmount)
      .input("TotalPaidAmount", sql.Decimal(10, 2), payload.TotalPaidAmount)
      .input("MeterNumber", sql.NVarChar(50), payload.MeterNumber)
      .input("CustomerName", sql.NVarChar(100), payload.CustomerName)
      .input("Address", sql.NVarChar(255), payload.Address)
      .input("Load", sql.NVarChar(100), payload.Load)
      .input("Remarks", sql.NVarChar(255), payload.Remarks)
      .query(`
        UPDATE [dbo].[tb_ElectricBill] SET
          [BillDate] = @BillDate, [DueDate] = @DueDate, [FromDate] = @FromDate, [ToDate] = @ToDate,
          [Unit] = @Unit, [Charge] = @Charge, [RateAmount] = @RateAmount, [FuelSearchCharge] = @FuelSearchCharge, [CTDTRent] = @CTDTRent, [DutyCharge] = @DutyCharge, [DGUnit] = @DGUnit, [DGCharge] = @DGCharge,
          [DGAmount] = @DGCharge, [PreviousBalance] = @PreviousBalance, [penalty] = @penalty, [Discount] = @Discount,
          [FixedCharge] = @FixedCharge, [MiscCharge] = @FixedCharge, [OtherCharge] = @OtherCharge,
          [ChargeAmount] = @ChargeAmount, [TotalPaidAmount] = @TotalPaidAmount, [MeterNumber] = @MeterNumber,
          [CustomerName] = @CustomerName, [Address] = @Address, [Load] = @Load, [Remarks] = @Remarks, [ModifiedDate] = CAST(GETDATE() AS DATE)
        OUTPUT INSERTED.* WHERE [ID] = @id
      `);
    if (!result.recordset.length) return response.status(404).json({ message: "Bill not found." });
    return response.json({ message: "Bill updated successfully.", bill: result.recordset[0] });
  } catch (error) {
    console.error("Bill update failed:", error.message);
    return response.status(503).json({ message: "Unable to update the bill right now." });
  }
});
app.get("/api/bills", async (request, response) => {
  try {
    const pool = await getDbPool();
    const flat = String(request.query.flat || "").trim();
    const requestBuilder = pool.request();
    let filter = "";
    if (flat) {
      requestBuilder.input("flat", sql.NVarChar(50), flat);
      filter = `WHERE CONVERT(NVARCHAR(50), [FlatID]) = @flat OR CONVERT(NVARCHAR(50), [FlatID]) = CONVERT(NVARCHAR(50), (SELECT TOP (1) [AssignFlatID] FROM [dbo].[AssignFlat] WHERE [UnitNo] = @flat))`;
    }
    const result = await requestBuilder.query(`
      SELECT bills.*, customer_details.[Address] AS [CustomerAddress], af.[UnitNo]
      FROM [dbo].[tb_ElectricBill] AS bills
      LEFT JOIN [dbo].[AssignFlat] AS af
        ON CONVERT(NVARCHAR(50), af.[AssignFlatID]) = CONVERT(NVARCHAR(50), bills.[FlatID])
      LEFT JOIN [dbo].[Customer] AS customer_details
        ON LTRIM(RTRIM(CONVERT(NVARCHAR(50), customer_details.[CustomerID]))) = LTRIM(RTRIM(CONVERT(NVARCHAR(50), bills.[CustomerID])))
      ${filter}
      ORDER BY [BillDate] DESC, [ID] DESC
    `);
    return response.json(result.recordset);
  } catch (error) {
    console.error("Bill fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load bills right now." });
  }
});

app.get("/api/admin/ledger", async (_request, response) => {
  try {
    await ensurePenaltyTable();
    const pool = await getDbPool();
    const accountResult = await pool.request().query(`
      WITH bill_totals AS (
        SELECT
          [FlatID],
          MAX([CustomerName]) AS [CustomerName],
          MAX([MeterNumber]) AS [MeterNumber],
          SUM(COALESCE([ChargeAmount], 0)) AS [BilledTotal],
          SUM(COALESCE([RateAmount], 0)) AS [RateAmount],
          SUM(COALESCE([Charge], 0)) AS [ChargeAmount],
          SUM(COALESCE([DGAmount], 0)) AS [DGAmount],
          SUM(COALESCE([PreviousBalance], 0)) AS [PreviousBalance],
          SUM(COALESCE([penalty], 0)) AS [BillPenalty],
          SUM(COALESCE([Discount], 0)) AS [Discount],
          MAX([BillDate]) AS [LastBillDate],
          MAX([Status]) AS [LastStatus],
          COUNT(*) AS [BillCount]
        FROM [dbo].[tb_ElectricBill]
        GROUP BY [FlatID]
      ), payment_totals AS (
        SELECT [FlatID], SUM(COALESCE([Amount], 0)) AS [PaidAmount]
        FROM [dbo].[tb_Payment]
        WHERE LTRIM(RTRIM(COALESCE([Status], ''))) = 'Active'
        GROUP BY [FlatID]
      ), penalty_totals AS (
        SELECT [FlatID], SUM(COALESCE([PenaltyAmount], 0)) AS [LatePenalty]
        FROM [dbo].[tb_ElectricityPenalty]
        WHERE LTRIM(RTRIM(COALESCE([Status], ''))) = 'Applied'
        GROUP BY [FlatID]
      )
      SELECT
        bills.[FlatID],
        COALESCE(CONVERT(NVARCHAR(50), af.[UnitNo]), CONVERT(NVARCHAR(50), bills.[FlatID])) AS [UnitNo],
        bills.[CustomerName], bills.[MeterNumber], bills.[BilledTotal],
        bills.[RateAmount], bills.[ChargeAmount], bills.[DGAmount],
        bills.[PreviousBalance], bills.[BillPenalty], bills.[Discount],
        COALESCE(penalties.[LatePenalty], 0) AS [LatePenalty],
        COALESCE(payments.[PaidAmount], 0) AS [PaidAmount],
        bills.[LastBillDate], bills.[LastStatus], bills.[BillCount]
      FROM bill_totals bills
      LEFT JOIN [dbo].[AssignFlat] af ON CONVERT(NVARCHAR(50), af.[AssignFlatID]) = bills.[FlatID]
      LEFT JOIN payment_totals payments ON TRY_CONVERT(INT, payments.[FlatID]) = TRY_CONVERT(INT, bills.[FlatID])
      LEFT JOIN penalty_totals penalties ON TRY_CONVERT(INT, penalties.[FlatID]) = TRY_CONVERT(INT, bills.[FlatID])
      ORDER BY bills.[LastBillDate] DESC, bills.[FlatID]
    `);
    const [billResult, paymentResult] = await Promise.all([
      pool.request().query(`
        SELECT
          bill.[ID], bill.[FlatID], bill.[CustomerID],
          COALESCE(CONVERT(NVARCHAR(50), af.[UnitNo]), CONVERT(NVARCHAR(50), bill.[FlatID])) AS [UnitNo],
          COALESCE(NULLIF(bill.[CustomerName], ''), customer_details.[CustomerName]) AS [CustomerName],
          bill.[MeterNumber], bill.[ReceiptID], bill.[BillDate], bill.[DueDate],
          bill.[FromDate], bill.[ToDate], bill.[Unit], bill.[RateAmount],
          bill.[Charge], bill.[ChargeAmount], bill.[TotalPaidAmount],
          bill.[DGUnit], bill.[DGCharge],
          bill.[DGAmount], bill.[PreviousBalance], bill.[penalty] AS [BillPenalty],
          bill.[Discount], bill.[FuelSearchCharge], bill.[CTDTRent], bill.[DutyCharge],
          bill.[FixedCharge], bill.[OtherCharge], bill.[Load], bill.[Address],
          bill.[Remarks], bill.[Status]
        FROM [dbo].[tb_ElectricBill] bill
        LEFT JOIN [dbo].[AssignFlat] af
          ON CONVERT(NVARCHAR(50), af.[AssignFlatID]) = CONVERT(NVARCHAR(50), bill.[FlatID])
        LEFT JOIN [dbo].[Customer] customer_details
          ON LTRIM(RTRIM(CONVERT(NVARCHAR(50), customer_details.[CustomerID]))) = LTRIM(RTRIM(CONVERT(NVARCHAR(50), bill.[CustomerID])))
        ORDER BY bill.[BillDate] DESC, bill.[ID] DESC
      `),
      pool.request().query(`
        SELECT
          p.[ID], p.[FlatID], p.[CustomerID],
          COALESCE(CONVERT(NVARCHAR(50), af.[UnitNo]), CONVERT(NVARCHAR(50), p.[FlatID])) AS [UnitNo],
          COALESCE(p.[CustomerName], customer_details.[CustomerName]) AS [CustomerName],
          p.[ReceiptDate], p.[Amount], p.[PaymentMode], p.[Bank], p.[Branch],
          p.[ChequeNo], p.[ChequeDate]
        FROM [dbo].[tb_Payment] p
        LEFT JOIN [dbo].[AssignFlat] af
          ON CONVERT(NVARCHAR(50), af.[AssignFlatID]) = CONVERT(NVARCHAR(50), p.[FlatID])
        LEFT JOIN [dbo].[Customer] customer_details ON customer_details.[CustomerID] = p.[CustomerID]
        WHERE LTRIM(RTRIM(COALESCE(p.[Status], ''))) = 'Active'
        ORDER BY p.[ReceiptDate] DESC, p.[ID] DESC
      `),
    ]);
    return response.json({
      accounts: accountResult.recordset,
      bills: billResult.recordset,
      payments: paymentResult.recordset,
    });
  } catch (error) {
    console.error("Ledger fetch failed:", error.message);
    return response.status(503).json({ message: "Unable to load ledger right now." });
  }
});

app.get("/api/bills/:id", async (request, response) => {
  const { id } = request.params;

  try {
    const pool = await getDbPool();
    const result = await pool.request()
      .input("id", sql.Int, Number(id))
      .query(`
        SELECT TOP (1) *
        FROM [dbo].[tb_ElectricBill]
        WHERE [ID] = @id
      `);

    if (!result.recordset.length) {
      return response.status(404).json({ message: "Bill not found." });
    }

    return response.json(result.recordset[0]);
  } catch (error) {
    console.error("Bill fetch by id failed:", error.message);
    return response.status(503).json({ message: "Unable to load bill details." });
  }
});

app.get("/api/health", (_request, response) => {
  response.json({ api: "ok" });
});

app.get("/api/health/db", async (_request, response) => {
  try {
    const pool = await getDbPool();
    await pool.request().query("SELECT 1 AS connected");
    response.json({ database: "connected" });
  } catch (error) {
    console.error("SQL Server connection failed:", error.message);
    response.status(503).json({ database: "unavailable", error: error.message });
  }
});

app.listen(port, () => {
  ensureElectricBillTable();
  ensureAssignFlatArrearsColumn().catch((error) => console.error("AssignFlat arrears migration failed:", error.message));
  console.log(`API listening on http://localhost:${port}`);
});
