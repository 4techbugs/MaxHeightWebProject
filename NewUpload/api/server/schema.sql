-- Run this once against the database configured in .env.
IF COL_LENGTH(N'dbo.AssignFlat', N'arrears') IS NULL
BEGIN
  IF COL_LENGTH(N'dbo.AssignFlat', N'areras') IS NOT NULL
    EXEC sp_rename N'dbo.AssignFlat.areras', N'arrears', N'COLUMN';
  ELSE
    ALTER TABLE [dbo].[AssignFlat] ADD [arrears] DECIMAL(18,2) NULL;
END;
GO

IF OBJECT_ID(N'[dbo].[tb_Employee]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[tb_Employee] (
    [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [Username] NVARCHAR(100) NOT NULL UNIQUE,
    [Password] NVARCHAR(255) NOT NULL
  );
END;
GO

-- Stores the 18% per-year late-payment calculation for each paid bill.
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
END;
GO

-- Add an employee account separately, for example:
-- INSERT INTO [dbo].[tb_Employee] ([Username], [Password])
-- VALUES (N'admin', N'admin');

IF OBJECT_ID(N'[dbo].[tb_ElectricBill]', N'U') IS NULL
BEGIN
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
    [DGUnit] DECIMAL(10,2) NOT NULL DEFAULT 0,
    [DGCharge] DECIMAL(10,2) NOT NULL DEFAULT 0,
    [DGAmount] DECIMAL(10,2) NOT NULL DEFAULT 0,
    [Remarks] NVARCHAR(255) NULL
  );
END;
GO