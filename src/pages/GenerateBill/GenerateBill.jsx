import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calculator, FilePlus2, Printer, RotateCcw, Save } from "lucide-react";
import Navbar from "../../components/Navbar/Navbar.jsx";
import Sidebar from "../../components/Sidebar/Sidebar.jsx";
import "./GenerateBill.css";

const slabs = [
  { upTo: 50, rate: 4.75, label: "0–50 units" },
  { upTo: 150, rate: 6.0, label: "51–150 units" },
  { upTo: 500, rate: 7.0, label: "151–500 units" },
  { upTo: Infinity, rate: 7.5, label: "Above 500 units" },
];

function calcGrid(units) {
  let charge = 0, remaining = units, breakdown = [];
  let prev = 0;
  for (const slab of slabs) {
    if (remaining <= 0) break;
    const slabSize = slab.upTo - prev;
    const used = Math.min(remaining, slabSize);
    const amount = used * slab.rate;
    breakdown.push({ label: slab.label, units: used, rate: slab.rate, amount });
    charge += amount;
    remaining -= used;
    prev = slab.upTo;
  }
  return { charge, breakdown };
}

const empty = { flat: "", unitNo: "", meter: "", grid: "", gd: "", arrears: "", penalty: "", other: "", remarks: "" };
const billingAddress = "Max Heiights Majestic, GH-III, Suncity Township, Village Nindar, Grand Sikar Road, Jaipur-302013";

function GenerateBill() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [selectedFlat, setSelectedFlat] = useState("");
  const [flatOptions, setFlatOptions] = useState([]);
  const [calculated, setCalculated] = useState(false);
  const activeProfile = flatOptions.find((item) => item.UnitNo === form.flat) || null;

  useEffect(() => {
    fetch("/api/assigned-flats")
      .then((response) => response.json())
      .then((data) => setFlatOptions(Array.isArray(data) ? data : []))
      .catch(() => setFlatOptions([]));
  }, []);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setCalculated(false); };

  const handleFlatChange = (value) => {
    setSelectedFlat(value);
    const profile = flatOptions.find((item) => item.UnitNo === value);

    setForm((current) => ({
      ...current,
      flat: value,
      unitNo: value,
      meter: profile ? profile.meter || "" : current.meter,
      arrears: profile ? String(profile.previousBalance || 0) : current.arrears,
      penalty: profile ? String(profile.previousPenalty || 0) : current.penalty,
    }));
    setCalculated(false);
  };
  const num = (v) => parseFloat(v) || 0;

  const gridUnits = num(form.grid);
  const gdUnits = num(form.gd);
  const arrears = num(form.arrears);
  const other = num(form.other);

  const { gridCharge, breakdown } = useMemo(() => {
    const r = calcGrid(gridUnits);
    return { gridCharge: r.charge, breakdown: r.breakdown };
  }, [gridUnits]);

  const gdCharge = gdUnits * 26;
  const fixedCharge = 495;
  const penalty = num(form.penalty);
  const total = gridCharge + gdCharge + fixedCharge + arrears + penalty + other;

  const handleCalculate = () => setCalculated(true);
  const handleReset = () => { setForm(empty); setSelectedFlat(""); setCalculated(false); };
  const handleSave = async () => {
    const activeProfile = flatOptions.find((item) => item.UnitNo === form.flat) || null;

    const payload = {
      flat: form.flat,
      FlatID: form.flat,
      unitNo: form.unitNo || form.flat,
      UnitNo: form.unitNo || form.flat,
      meter: form.meter,
      grid: form.grid,
      gd: form.gd,
      arrears: form.arrears,
      penalty: penalty,
      other: form.other,
      remarks: form.remarks,
      charge: gridCharge,
      dgCharge: gdCharge,
      fixedCharge,
      otherCharge: other,
      total: total,
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      customerName: activeProfile ? activeProfile.customerName : "Customer " + (form.flat || "Walk-in"),
      phone: activeProfile ? activeProfile.phone : "",
      status: "Pending",
      createdBy: "admin",
    };

    try {
      const response = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to save bill.");
      setCalculated(true);
      navigate("/bill-history");
    } catch (error) {
      alert(error.message || "Unable to save the bill.");
    }
  };
  const handlePrint = () => window.print();

  const billNumber = activeProfile ? `BILL-${String(activeProfile.unitNo || form.unitNo || form.flat || "NEW").replace(/[^0-9A-Za-z]/g, "")}` : "BILL-NEW";
  const today = new Date();
  const billDateText = today.toLocaleDateString("en-IN");
  const dueDateText = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN");
  const customerName = activeProfile ? activeProfile.customerName : (form.flat ? "Customer Walk-in" : "Customer Name");
  const unitNo = activeProfile ? (activeProfile.unitNo || form.unitNo || form.flat || "-") : (form.unitNo || form.flat || "-");
  const meterNo = form.meter || activeProfile?.meter || "-";
  const billAddress = `${unitNo}, ${billingAddress}`;
  const billContact = activeProfile ? (activeProfile.phone || "-") : "-";
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fromDateText = firstDayOfMonth.toLocaleDateString("en-IN");
  const toDateText = lastDayOfMonth.toLocaleDateString("en-IN");

  return (
    <div className="eb-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="eb-content">
        <Navbar title="Generate Bill" onMenu={() => setSidebarOpen(true)} />
        <div className="eb-page">
          <div className="eb-page-heading">
            <div><h1>Generate Bill</h1><p>Calculate electricity charges based on current consumption and dues.</p></div>
          </div>

          <div className="eb-gen-grid">
            <div className="eb-card eb-gen-form">
              <div className="eb-card-header"><div><h2>Bill Details</h2><p>Enter consumption and charges</p></div></div>
              <div className="eb-form-grid" style={{ padding: "24px" }}>
                <div className="eb-field eb-field-full">
                  <label>Unit No / Flat No</label>
                  <select value={selectedFlat} onChange={(event) => handleFlatChange(event.target.value)} className="eb-legacy-select">
                    <option value="">Select Unit No</option>
                    {flatOptions.map((item) => (
                      <option key={item.AssignFlatID} value={item.UnitNo}>{item.UnitNo} | {item.customerName || "Customer"} | {item.meter || "No meter"}</option>
                    ))}
                  </select>
                </div>

                {activeProfile && (
                  <div className="eb-legacy-bind eb-field-full">
                    <div className="eb-legacy-bind-row"><span>Unit No</span><strong>{activeProfile.unitNo}</strong></div>
                    <div className="eb-legacy-bind-row"><span>Customer Name</span><strong>{activeProfile.customerName}</strong></div>
                    <div className="eb-legacy-bind-row"><span>Meter</span><strong>{activeProfile.meter}</strong></div>
                    <div className="eb-legacy-bind-row"><span>Address</span><strong>{activeProfile.address}</strong></div>
                  </div>
                )}

                <div className="eb-field"><label>Meter Number</label><input value={form.meter} onChange={set("meter")} placeholder="e.g. 45217890" /></div>
                <div className="eb-field"><label>Grid Units (kWh)</label><input type="number" value={form.grid} onChange={set("grid")} placeholder="e.g. 320" /></div>
                <div className="eb-field"><label>GD Units</label><input type="number" value={form.gd} onChange={set("gd")} placeholder="e.g. 45" /></div>
                <div className="eb-field"><label>Arrears (₹)</label><input type="number" value={form.arrears} onChange={set("arrears")} placeholder="e.g. 500" /></div>
                <div className="eb-field"><label>Interest on arrears (₹)</label><input type="number" min="0" step="0.01" value={form.penalty} onChange={set("penalty")} placeholder="e.g. 25" /></div>
                <div className="eb-field"><label>Other Charges (₹)</label><input type="number" value={form.other} onChange={set("other")} placeholder="e.g. 120" /></div>
                <div className="eb-field eb-field-full"><label>Remarks</label><textarea value={form.remarks} onChange={set("remarks")} placeholder="Optional notes about this bill..." /></div>
              </div>
              <div className="eb-gen-actions">
                <button className="eb-btn eb-btn-primary" onClick={handleCalculate}><Calculator size={16} />Calculate Bill</button>
                <button className="eb-btn eb-btn-light" onClick={handleReset}><RotateCcw size={16} />Reset</button>
                <button className="eb-btn eb-btn-light" onClick={handleSave}><Save size={16} />Save Bill</button>
                <button className="eb-btn eb-btn-light" onClick={handlePrint}><Printer size={16} />Print Bill</button>
              </div>
            </div>

            <div className="eb-card eb-gen-summary">
              <div className="eb-card-header"><div><h2>Bill Summary</h2><p>Live calculation preview</p></div></div>
              <div className="eb-gen-summary-body">
                {breakdown.length > 0 && (
                  <div className="eb-gen-slab">
                    <h3>Grid charge breakdown</h3>
                    {breakdown.map((b) => <div key={b.label}><span>{b.label}</span><span>{b.units} × ₹{b.rate}</span><strong>₹{b.amount.toFixed(0)}</strong></div>)}
                  </div>
                )}
                <div className="eb-gen-line"><span>Grid Charges</span><strong>₹{gridCharge.toFixed(0)}</strong></div>
                <div className="eb-gen-line"><span>GD Charges ({gdUnits} × ₹26)</span><strong>₹{gdCharge.toFixed(0)}</strong></div>
                <div className="eb-gen-line"><span>Fixed Charges</span><strong>₹{fixedCharge}</strong></div>
                <div className="eb-gen-line"><span>Arrears</span><strong>₹{arrears.toFixed(0)}</strong></div>
                <div className="eb-gen-line"><span>Interest on arrears</span><strong>₹{penalty.toFixed(2)}</strong></div>
                <div className="eb-gen-line"><span>Other Charges</span><strong>₹{other.toFixed(0)}</strong></div>
                <div className="eb-gen-total"><span>Final Payable Amount</span><strong>₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                {calculated && <div className="eb-gen-calculated">Bill calculated successfully. Use Save Bill to store it.</div>}
              </div>
            </div>
          </div>

          <div className="eb-legacy-print-sheet">
            <div className="eb-ref-bill-sheet">
              <div className="eb-ref-title-row">BILL OF SUPPLY FOR ELECTRICITY / WATER</div>
              <div className="eb-ref-company-row">
                <div className="eb-ref-company-name">PAAS SIKAR LOGISTICS LLP</div>
                <div className="eb-ref-company-address">Reg. office at GH-III, Suncity Township, Sikar Road, Jaipur-302013</div>
                <div className="eb-ref-company-address">Corp. office at A-17, Ground Floor, Pitampura, New Delhi-110034.</div>
              </div>

              <div className="eb-ref-main-grid">
                <div className="eb-ref-left-col">
                  <div className="eb-ref-field-row">
                    <span>Name:</span>
                    <strong>{customerName}</strong>
                  </div>
                  <div className="eb-ref-field-row compact">
                    <span>SoWoDo:</span>
                    <strong>{customerName}</strong>
                  </div>
                  <div className="eb-ref-field-row address-row">
                    <span>Address:</span>
                    <strong>{billAddress}</strong>
                  </div>
                  <div className="eb-ref-field-row flat-row">
                    <span>Flat No:</span>
                    <strong>{unitNo}</strong>
                  </div>
                  <div className="eb-ref-field-row contact-row">
                    <span>Contact:</span>
                    <strong>{billContact}</strong>
                  </div>
                </div>

                <div className="eb-ref-right-col">
                  <div className="eb-ref-meta-row">
                    <span>Meter No.:</span>
                    <strong>{meterNo}</strong>
                    <span className="eb-ref-separator">Bill No:</span>
                    <strong>{billNumber}</strong>
                  </div>
                  <div className="eb-ref-meta-row">
                    <span>Sanctioned Load</span>
                    <strong>12 KW</strong>
                  </div>
                  <div className="eb-ref-meta-row date-row">
                    <span>Bill Period:</span>
                    <strong>{fromDateText} to {toDateText}</strong>
                    <span className="eb-ref-separator">Bill Date:</span>
                    <strong>{billDateText}</strong>
                  </div>
                  <div className="eb-ref-meta-row date-row">
                    <span>Bill Issued Date:</span>
                    <strong>{billDateText}</strong>
                    <span className="eb-ref-separator">Due Date:</span>
                    <strong>{dueDateText}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default GenerateBill;
