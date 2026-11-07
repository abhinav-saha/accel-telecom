
import { Routes, Route } from 'react-router-dom';

import Home from '../pages/Home';
import Explore from '../pages/Explore';
import ForYouPlaceholder from '../pages/ForYouPlaceholder';
import Cart from '../pages/Cart';
import CheckoutPlaceholder from '../pages/CheckoutPlaceholder';
import Profile from '../pages/Profile/Profile';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/for-you" element={<ForYouPlaceholder />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/checkout" element={<CheckoutPlaceholder />} />
      <Route path="/profile" element={<Profile />} />
    </Routes>
  );
}

export default AppRoutes;
