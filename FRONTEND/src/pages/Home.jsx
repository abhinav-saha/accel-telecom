
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Building2,
  Tag,
  MapPin,
  Package,
  Layers,
  BadgeIndianRupee,
  Rocket,
  Headset,
  Compass,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import SectionHeading from "../components/SectionHeading";
import ProductCard from "../components/ProductCard";
import CategoryCard from "../components/CategoryCard";
import {
  categories,
  categoryDescriptions,
  getFeaturedProducts,
} from "../data/productCatalogue";
import { mockUser, getGreeting } from "../data/mockUser";
import { profileApi } from "../services/profile.api";
import "./Home.scss";

const featuredProductIds = ["P01", "P15", "P16", "P19"];

// Calculated once when the website loads.
const pageLoadGreeting = getGreeting();

const benefits = [
  {
    icon: Layers,
    title: "One-stop business solutions",
    description:
      "Connectivity, communication, cloud, security and IoT — sourced, configured and managed from a single platform.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Transparent pricing",
    description:
      "Every product shows its starting price, setup fee and minimum contract upfront. No hidden charges.",
  },
  {
    icon: Rocket,
    title: "Simplified digital onboarding",
    description:
      "Browse, select and activate services online with guided setup and clear installation timelines.",
  },
  {
    icon: Headset,
    title: "Dedicated business support",
    description:
      "A support team that understands business needs, with fast installation times across most products.",
  },
];

function Home() {
  const greeting = pageLoadGreeting;

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const result = await profileApi.getProfile();

        if (active) {
          setProfile(result?.profile || {});
        }
      } catch (error) {
        console.error("Unable to load profile:", error);

        if (active) {
          setProfile({});
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const firstName =
    profile?.fullName?.trim()?.split(/\s+/)[0] ||
    profile?.username?.trim()?.split(/\s+/)[0] ||
    "there";

  const businessName =
    profile?.businessName || "Add business details in Profile";

  const businessCategory =
    profile?.category || "Add business category in Profile";

  const location =
    profile?.location || "Add location in Profile";

  const featuredProducts = getFeaturedProducts(["micro", "prof"]).filter(
    (product) => featuredProductIds.includes(product.product_id),
  );

  const categoriesWithDescriptions = categories.map((category) => ({
    ...category,
    description: categoryDescriptions[category.name] ?? "",
  }));

  return (
    <main className="home">
      {/* ===== Section A: Hero ===== */}
      <section className="hero" id="hero" aria-labelledby="hero-heading">
        <div className="hero__inner">
          <div className="hero__content">
            <span className="hero__eyebrow">Accel Business Platform</span>
            <h1 className="hero__title" id="hero-heading">
              Everything your business needs. All in one place.
            </h1>
            <p className="hero__subtitle">
              Power your business with reliable connectivity, communication,
              cloud and security solutions from Accel Business.
            </p>
            <div className="hero__actions">
              <Link to="/explore" className="hero__cta hero__cta--primary">
                Explore Products
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/for-you" className="hero__cta hero__cta--secondary">
                <Sparkles size={18} aria-hidden="true" />
                Build My Bundle
              </Link>
            </div>
          </div>

          <div className="hero__visual" aria-hidden="true">
            <div className="hero__visual-card hero__visual-card--1">
              <Compass size={22} />
              <span>25 Solutions</span>
            </div>
            <div className="hero__visual-card hero__visual-card--2">
              <ShieldCheck size={22} />
              <span>5 Categories</span>
            </div>
            <div className="hero__visual-card hero__visual-card--3">
              <Sparkles size={22} />
              <span>AI Bundle Builder</span>
            </div>
            <div className="hero__visual-glow" />
          </div>
        </div>
      </section>

      {/* ===== Section B: Business Overview ===== */}
      <section
        className="overview"
        id="overview"
        aria-labelledby="overview-heading"
      >
        <div className="overview__inner">
          <div className="overview__greeting">
            <h2 className="overview__title" id="overview-heading">
              {greeting}, {firstName}
            </h2>
            <p className="overview__subtitle">
              Let's get your business connected.
            </p>
          </div>

          <ul className="overview__stats">
            <li className="overview__stat">
              <span className="overview__stat-icon" aria-hidden="true">
                <Building2 size={20} />
              </span>
              <span className="overview__stat-label">Business</span>
              <span className="overview__stat-value">{businessName}</span>
            </li>

            <li className="overview__stat">
              <span className="overview__stat-icon" aria-hidden="true">
                <Tag size={20} />
              </span>
              <span className="overview__stat-label">Category</span>
              <span className="overview__stat-value">
                {businessCategory}
              </span>
            </li>

            <li className="overview__stat">
              <span className="overview__stat-icon" aria-hidden="true">
                <MapPin size={20} />
              </span>
              <span className="overview__stat-label">Location</span>
              <span className="overview__stat-value">{location}</span>
            </li>

            <li className="overview__stat">
              <span className="overview__stat-icon" aria-hidden="true">
                <Package size={20} />
              </span>
              <span className="overview__stat-label">Active bundles</span>
              <span className="overview__stat-value">
                {mockUser.selectedBundleCount}
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* ===== Section C: Featured Offers ===== */}
      <section
        className="featured"
        id="featured-offers"
        aria-labelledby="featured-heading"
      >
        <div className="featured__inner">
          <SectionHeading
            title="Offers for Your Business"
            subtitle="Hand-picked products suited for micro and professional businesses like yours."
            id="featured-heading"
          />
          <div className="featured__grid">
            {featuredProducts.map((product) => (
              <ProductCard key={product.product_id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== Section D: Browse by Category ===== */}
      <section
        className="categories"
        id="browse-categories"
        aria-labelledby="categories-heading"
      >
        <div className="categories__inner">
          <SectionHeading
            title="Solutions for Every Business Need"
            subtitle="Browse across five categories of business-grade services."
            id="categories-heading"
          />
          <div className="categories__grid">
            {categoriesWithDescriptions.map((category) => (
              <Link
                to="/explore"
                key={category.name}
                className="categories__link"
                aria-label={`Browse ${category.name} products`}
              >
                <CategoryCard category={category} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Section E: Why Accel Business ===== */}
      <section
        className="why-accel"
        id="why-accel"
        aria-labelledby="why-accel-heading"
      >
        <div className="why-accel__inner">
          <SectionHeading
            title="Why Accel Business?"
            subtitle="Built for businesses that want reliable services without complexity."
            id="why-accel-heading"
          />
          <div className="why-accel__grid">
            {benefits.map(({ icon: Icon, title, description }) => (
              <article className="why-accel__item" key={title}>
                <span className="why-accel__icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={2} />
                </span>
                <h3 className="why-accel__item-title">{title}</h3>
                <p className="why-accel__item-description">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Section F: AI Advisor Promotion ===== */}
      <section
        className="ai-promo"
        id="ai-advisor"
        aria-labelledby="ai-promo-heading"
      >
        <div className="ai-promo__inner">
          <div className="ai-promo__content">
            <span className="ai-promo__eyebrow">AI Advisor</span>
            <h2 className="ai-promo__title" id="ai-promo-heading">
              Not sure what your business needs?
            </h2>
            <p className="ai-promo__description">
              Tell us about your business. Our AI advisor will understand your
              requirements and recommend the right combination of services.
            </p>
            <Link to="/for-you" className="ai-promo__cta">
              <Sparkles size={18} aria-hidden="true" />
              Build My Bundle
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="ai-promo__visual" aria-hidden="true">
            <div className="ai-promo__orb">
              <Sparkles size={48} strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Home;
