import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Phone, Plug, ShieldCheck, UserRound, Zap } from "lucide-react";
import "./Login.css";

async function readApiResponse(result) {
  const body = await result.text();
  let data = {};

  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error("The login service returned an invalid response.");
    }
  }

  if (!result.ok) {
    throw new Error(data.message || "The login service is unavailable. Please start the API server.");
  }

  return data;
}

function Login() {
  const navigate = useNavigate();
  const [meter, setMeter] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMeter, setShowMeter] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [panelStep, setPanelStep] = useState(true);
  const [adminStep, setAdminStep] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!otpStep) {
      if (!meter.trim()) return setError("Please enter your meter number.");
      if (!/^[a-z0-9-]{6,50}$/i.test(meter.trim())) return setError("Enter a valid meter number (6–50 letters or digits).");
      if (!/^\d{10}$/.test(phone.trim())) return setError("Please enter a valid 10-digit phone number.");
      setLoading(true);
      try {
        const result = await fetch("/api/auth/request-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meter: meter.trim(), phone: phone.trim() }),
        });
        const data = await readApiResponse(result);
        setOtpStep(true);
        setNotice(data.devOtp ? `Development OTP: ${data.devOtp}` : "OTP sent successfully.");
      } catch (requestError) {
        setError(requestError instanceof TypeError ? "The login service is offline. Run npm run server." : requestError.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!/^\d{6}$/.test(otp.trim())) return setError("Please enter the 6-digit OTP.");
    setLoading(true);
    try {
      const result = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meter: meter.trim(), phone: phone.trim(), otp: otp.trim() }),
      });
      await readApiResponse(result);
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof TypeError ? "The login service is offline. Run npm run server." : requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const chooseClientPanel = () => {
    setPanelStep(false);
    setAdminStep(false);
    setError("");
  };

  const chooseAdminPanel = () => {
    setPanelStep(false);
    setAdminStep(true);
    setError("");
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });
      await readApiResponse(result);
      navigate("/admin");
    } catch (requestError) {
      setError(requestError instanceof TypeError ? "The login service is offline. Run npm run server." : requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="eb-login">
      <div className="eb-login-art">
        <div className="eb-login-art-inner">
          <div className="eb-art-logo"><Zap size={26} fill="currentColor" /><span>Power<span>Pay</span></span></div>
          <h2>Smart electricity billing,<br />simplified for every home.</h2>
          <p>Generate accurate bills, track consumption, and manage payments — all from one clean dashboard built for consumers.</p>
          <div className="eb-art-stats">
            <div><strong>12k+</strong><span>Active meters</span></div>
            <div><strong>₹2.4Cr</strong><span>Bills processed</span></div>
            <div><strong>99.9%</strong><span>Uptime</span></div>
          </div>
        </div>
      </div>

      <div className="eb-login-form-side">
        <div className="eb-login-card">
          <div className="eb-login-mark"><Plug size={24} /></div>
          <h1>{panelStep ? "Choose your panel" : adminStep ? "Admin sign in" : "Welcome back"}</h1>
          <p>{panelStep ? "Select where you want to continue." : adminStep ? "Enter your administrator credentials." : otpStep ? `Enter the OTP sent to ******${phone.slice(-4)}.` : "Sign in with your meter details to access your billing dashboard."}</p>

          {panelStep ? <div className="eb-panel-choice">
            <button type="button" className="eb-panel-option eb-panel-client" onClick={chooseClientPanel}><span><UserRound size={22} /></span><div><strong>Client panel</strong><small>View your meter, bills, payments, and usage.</small></div><Zap size={17} /></button>
            <button type="button" className="eb-panel-option eb-panel-admin" onClick={chooseAdminPanel}><span><ShieldCheck size={22} /></span><div><strong>Admin panel</strong><small>Manage users, bills, payments, and reports.</small></div><Zap size={17} /></button>
          </div> : adminStep ? <form onSubmit={handleAdminLogin} className="eb-login-form" noValidate>
            <div className="eb-login-field"><label htmlFor="admin-username">Username</label><div className="eb-input-wrap"><UserRound size={17} /><input id="admin-username" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="Admin username" autoComplete="username" autoFocus /></div></div>
            <div className="eb-login-field"><label htmlFor="admin-password">Password</label><div className="eb-input-wrap"><Lock size={17} /><input id="admin-password" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Admin password" autoComplete="current-password" /></div></div>
            {error && <div className="eb-login-error">{error}</div>}
            <button type="submit" className="eb-login-submit" disabled={loading}>{loading ? <><Loader2 size={17} className="eb-spin" /> Checking...</> : <>Open admin panel <ShieldCheck size={16} /></>}</button>
            <button type="button" className="eb-login-back" onClick={() => { setAdminStep(false); setPanelStep(true); setError(""); }}>Back to panel choice</button>
          </form> : <form onSubmit={handleSubmit} className="eb-login-form" noValidate>
            {!otpStep ? <>
              <div className="eb-login-field">
                <label>Meter Number</label>
                <div className="eb-input-wrap">
                  <Lock size={17} />
                  <input type={showMeter ? "text" : "password"} value={meter} onChange={(e) => setMeter(e.target.value)} placeholder="e.g. 45217890" autoComplete="off" />
                  <button type="button" onClick={() => setShowMeter((v) => !v)} className="eb-eye-btn" aria-label="Toggle meter visibility">{showMeter ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div className="eb-login-field">
                <label>Phone Number</label>
                <div className="eb-input-wrap">
                  <Phone size={17} />
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="10-digit mobile number" maxLength={10} />
                </div>
              </div>
            </> : <div className="eb-login-field">
              <label htmlFor="login-otp">One-time password</label>
              <div className="eb-input-wrap eb-otp-wrap">
                <Lock size={17} />
                <input id="login-otp" type="text" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit OTP" maxLength={6} autoComplete="one-time-code" autoFocus />
              </div>
              <span className="eb-otp-hint">The OTP expires in 5 minutes.</span>
            </div>}
            {error && <div className="eb-login-error">{error}</div>}
            {notice && <div className="eb-login-notice" role="status">{notice}</div>}
            <button type="submit" className="eb-login-submit" disabled={loading}>{loading ? <><Loader2 size={17} className="eb-spin" /> {otpStep ? "Verifying..." : "Sending OTP..."}</> : <>{otpStep ? "Verify & sign in" : "Send OTP"} <Zap size={16} fill="currentColor" /></>}</button>
            {otpStep && <button type="button" className="eb-login-back" onClick={() => { setOtpStep(false); setOtp(""); setError(""); setNotice(""); }}>Use different details</button>}
            {!otpStep && <button type="button" className="eb-login-back" onClick={() => { setPanelStep(true); setError(""); setNotice(""); }}>Back to panel choice</button>}
          </form>}

          <div className="eb-login-foot">By signing in you agree to our Terms of Service & Privacy Policy.</div>
        </div>
      </div>
    </div>
  );
}
export default Login;
