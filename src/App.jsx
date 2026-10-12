import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login/Login.jsx";
import Dashboard from "./pages/Dashboard/Dashboard.jsx";
import GenerateBill from "./pages/GenerateBill/GenerateBill.jsx";
import BillHistory from "./pages/BillHistory/BillHistory.jsx";
import PaymentHistory from "./pages/PaymentHistory/PaymentHistory.jsx";
import BillDetails from "./pages/BillDetails/BillDetails.jsx";
import AdminDashboard from "./pages/Admin/AdminDashboard.jsx";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/generate-bill" element={<GenerateBill />} />
        <Route path="/bill-history" element={<BillHistory />} />
        <Route path="/payment-history" element={<PaymentHistory />} />
        <Route path="/bill-details/:id" element={<BillDetails />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
