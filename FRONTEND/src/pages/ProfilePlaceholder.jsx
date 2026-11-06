import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { mockUser } from '../data/mockUser';
import './Placeholder.scss';

function ProfilePlaceholder() {
  return (
    <div className="placeholder">
      <span className="placeholder__icon" aria-hidden="true">
        <User size={40} strokeWidth={1.5} />
      </span>
      <h1 className="placeholder__title">Profile</h1>
      <p className="placeholder__message">Coming soon</p>
      <p className="placeholder__user">
        Signed in as {mockUser.firstName} {mockUser.lastName}
      </p>
      <Link to="/" className="placeholder__link">
        Back to Home
      </Link>
    </div>
  );
}

export default ProfilePlaceholder;
