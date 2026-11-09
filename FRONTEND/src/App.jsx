
import { BrowserRouter, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Toast from "./components/Toast";
import AppRoutes from "./routes/AppRoutes";
import Bundle from "./pages/Bundle";
import { CartProvider } from "./context/CartContext";
import "./styles/main.scss";

function AppLayout() {
  const { pathname } = useLocation();
  const isAdminPage = pathname.startsWith("/admin");

  return (
    <>
      {!isAdminPage && <Navbar />}

      <AppRoutes />

      <Bundle />

      {!isAdminPage && <Footer />}

      <Toast />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <AppLayout />
      </CartProvider>
    </BrowserRouter>
  );
}

export default App;
