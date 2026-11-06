import { BrowserRouter } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Toast from "./components/Toast";
import AppRoutes from "./routes/AppRoutes";
import { CartProvider } from "./context/CartContext";
import "./styles/main.scss";

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Navbar />
        <AppRoutes />
        <Footer />
        <Toast />
      </CartProvider>
    </BrowserRouter>
  );
}

export default App;
