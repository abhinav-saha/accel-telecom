import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import './Footer.scss';

const footerLinks = [
  { label: 'About', href: '#' },
  { label: 'Contact', href: '#' },
  { label: 'Help & Support', href: '#' },
  { label: 'Privacy Policy', href: '#' },
  { label: 'Terms & Conditions', href: '#' },
];

function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      <div className="footer__inner">
        <div className="footer__brand-block">
          <Link to="/" className="footer__brand" aria-label="Accel Business home">
            <span className="footer__logo" aria-hidden="true">
              <Zap size={20} strokeWidth={2.5} />
            </span>
            <span className="footer__brand-name">Accel Business</span>
          </Link>
          <p className="footer__tagline">
            Connectivity, communication, cloud and security — everything your
            business needs, all in one place.
          </p>
        </div>

        <nav className="footer__links" aria-label="Footer navigation">
          <ul className="footer__link-list">
            {footerLinks.map(({ label, href }) => (
              <li className="footer__link-item" key={label}>
                <a href={href} className="footer__link">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="footer__bar">
        <p className="footer__copyright">
          &copy; {year} Accel Business. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
