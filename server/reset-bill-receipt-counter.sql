USE [maxheightdb];
GO

SET XACT_ABORT ON;

IF OBJECT_ID(N'[dbo].[tb_BillReceiptCounter]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[tb_BillReceiptCounter] (
    [CounterID] INT NOT NULL PRIMARY KEY,
    [NextValue] INT NOT NULL
  );
END;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @lockResult INT;
  EXEC @lockResult = sys.sp_getapplock
    @Resource = N'tb_ElectricBill_ReceiptID',
    @LockMode = 'Exclusive',
    @LockOwner = 'Transaction',
    @LockTimeout = 10000;

  IF @lockResult < 0
  BEGIN
    ;THROW 50001, 'Unable to lock the receipt number sequence.', 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM [dbo].[tb_ElectricBill]
    WHERE TRY_CONVERT(INT, [ReceiptID]) = 1
  )
  BEGIN
    ;THROW 50002, 'ReceiptID 1 is already in use; the counter was not reset.', 1;
  END;

  IF EXISTS (SELECT 1 FROM [dbo].[tb_BillReceiptCounter] WHERE [CounterID] = 1)
  BEGIN
    UPDATE [dbo].[tb_BillReceiptCounter]
    SET [NextValue] = 1
    WHERE [CounterID] = 1;
  END
  ELSE
  BEGIN
    INSERT INTO [dbo].[tb_BillReceiptCounter] ([CounterID], [NextValue])
    VALUES (1, 1);
  END;

  COMMIT TRANSACTION;

  SELECT DB_NAME() AS [DatabaseName], [NextValue] AS [NextReceiptID]
  FROM [dbo].[tb_BillReceiptCounter]
  WHERE [CounterID] = 1;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
