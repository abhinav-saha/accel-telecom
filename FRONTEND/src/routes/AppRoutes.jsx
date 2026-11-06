import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import Explore from '../pages/Explore';
import ForYouPlaceholder from '../pages/ForYouPlaceholder';
import CartPlaceholder from '../pages/CartPlaceholder';
import ProfilePlaceholder from '../pages/ProfilePlaceholder';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/for-you" element={<ForYouPlaceholder />} />
      <Route path="/cart" element={<CartPlaceholder />} />
      <Route path="/profile" element={<ProfilePlaceholder />} />
    </Routes>
  );
}

export default AppRoutes;
