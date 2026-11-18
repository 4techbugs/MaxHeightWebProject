import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateArrears, normalizeBillPayload } from './billUtils.js';

test('legacy bill payload keeps flat id and created by as text values', () => {
  const payload = normalizeBillPayload({
    flat: 'A-1204',
    meter: '1234567890',
    grid: 320,
    gd: 45,
    arrears: 200,
    other: 50,
    charge: 1750,
    dgCharge: 1170,
    total: 3450,
    billDate: '2025-09-10',
    dueDate: '2025-09-25',
    customerName: 'Test Customer',
    status: 'Pending',
    createdBy: 'admin',
  });

  assert.equal(payload.FlatID, 'A-1204');
  assert.equal(payload.CreatedBy, 'admin');
  assert.equal(payload.MeterNumber, '1234567890');
  assert.equal(Number(payload.ChargeAmount), 1750);
  assert.equal(Number(payload.RateAmount), 0);
  assert.equal(Number(payload.TotalPaidAmount), 3450);
});

test('legacy bill payload preserves numeric totals while using text metadata', () => {
  const payload = normalizeBillPayload({
    flat: 'B-2041',
    meter: '45217890',
    grid: 320,
    gd: 40,
    arrears: 0,
    other: 0,
    charge: 1900,
    dgCharge: 1040,
    total: 2940,
    billDate: '2025-08-12',
    createdBy: 'admin',
  });

  assert.equal(payload.FlatID, 'B-2041');
  assert.equal(payload.CreatedBy, 'admin');
  assert.equal(payload.Unit, 320);
  assert.equal(payload.DGAmount, 1040);
  assert.equal(payload.ChargeAmount, 1900);
  assert.equal(payload.RateAmount, 0);
  assert.equal(payload.TotalPaidAmount, 2940);
});

test('bill payload preserves separate rate amount from charge amount', () => {
  const payload = normalizeBillPayload({ charge: 598, rateAmount: 32, total: 21079.77 });

  assert.equal(payload.ChargeAmount, 598);
  assert.equal(payload.RateAmount, 32);
});

test('bill date fields preserve the selected calendar dates', () => {
  const payload = normalizeBillPayload({
    fromDate: '2026-07-31',
    toDate: '2026-08-30',
    billDate: '2026-11-14',
    dueDate: '2026-12-14',
  });

  assert.equal(payload.FromDate.toISOString().slice(0, 10), '2026-07-31');
  assert.equal(payload.ToDate.toISOString().slice(0, 10), '2026-08-30');
  assert.equal(payload.BillDate.toISOString().slice(0, 10), '2026-11-14');
  assert.equal(payload.DueDate.toISOString().slice(0, 10), '2026-12-14');
});

test('arrears use the corrected payment without adding the bill being edited', () => {
  assert.equal(calculateArrears(11130.70, 0, 5058), 6072.70);
});
