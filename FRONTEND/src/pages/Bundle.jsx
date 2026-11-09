
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Send,
  Sparkles,
  RotateCcw,
  ShoppingCart,
  Bookmark,
  Check,
  Plus,
} from "lucide-react";

import { useCart } from "../context/CartContext";
import { profileApi } from "../services/profile.api";
import "./Bundle.scss";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const ADVISOR_API = `${API_URL}/api/advisor`;

function getCatalogueProducts(data) {
  if (Array.isArray(data)) return data;
  return data.products || data.items || data.catalogue || [];
}

function getRecommendation(data) {
  if (!data) return null;

  if (Array.isArray(data.items)) return data;

  const possible = [
    data.recommendation,
    data.recommended_bundle,
    data.bundle,
    data.quote,
    data.result,
  ];

  return possible.find((item) => item && Array.isArray(item.items)) || null;
}

function getQuotedPrice(messages) {
  const text = messages
    .filter((message) => message.role === "advisor")
    .map((message) => message.text)
    .join(" ");

  const match = text.match(/₹\s*([\d,]+)\s*\/\s*month/i);

  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function formatPrice(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function Bundle() {
  const { pathname } = useLocation();
  const { addToCart } = useCart();

  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [chips, setChips] = useState([]);
  const [multi, setMulti] = useState(false);
  const [selectedChips, setSelectedChips] = useState([]);
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);

  const chatContainerRef = useRef(null);
  const hasInitialized = useRef(false);

  const advisorPrice = getQuotedPrice(messages);

  // Scroll only inside the chatbot container.
  useEffect(() => {
    const chat = chatContainerRef.current;

    if (!chat) return;

    chat.scrollTo({
      top: chat.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const loadCatalogue = useCallback(async () => {
    try {
      const response = await fetch(`${ADVISOR_API}/catalogue`);
      if (!response.ok) throw new Error("Unable to load product catalogue");

      const data = await response.json();
      setCatalogue(getCatalogueProducts(data));
    } catch (err) {
      console.error("Catalogue loading failed:", err);
      setError("Unable to load product prices. Please refresh the page.");
    }
  }, []);

  const startAdvisor = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessages([]);
    setChips([]);
    setSelectedChips([]);
    setRecommendation(null);
    setSelectedProducts([]);
    setSaved(false);
    setProgress(0);
    setSessionId("");
    setInput("");

    try {
      const response = await fetch(`${ADVISOR_API}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "Could not start advisor"
        );
      }

      setSessionId(data.session_id);
      setMessages(
        (data.messages || []).map((text) => ({ role: "advisor", text }))
      );
      setChips(data.chips || []);
      setMulti(Boolean(data.multi));
      setProgress(data.progress || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname !== "/for-you" || hasInitialized.current) return;

    hasInitialized.current = true;
    void startAdvisor();
    void loadCatalogue();
  }, [pathname, startAdvisor, loadCatalogue]);

  const sendAnswer = async (answer) => {
    const cleanAnswer = String(answer || "").trim();

    if (!cleanAnswer || !sessionId || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: cleanAnswer },
    ]);

    setInput("");
    setSelectedChips([]);
    setChips([]);
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${ADVISOR_API}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          text: cleanAnswer,
          value: cleanAnswer,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || "Could not send answer");
      }

      const newMessages = (data.messages || []).map((text) => ({
        role: "advisor",
        text,
      }));

      setMessages((prev) => [...prev, ...newMessages]);
      setChips(data.chips || []);
      setMulti(Boolean(data.multi));
      setProgress(data.progress || 0);

      const finalRecommendation = getRecommendation(data);

      if (finalRecommendation || data.stage !== "chat" || data.done) {
        if (finalRecommendation) {
          setRecommendation(finalRecommendation);
          setSelectedProducts(
            finalRecommendation.items
              .filter((item) => item.on || item.core)
              .map((item) => item.product_id)
          );
        } else {
          setError(
            "The advisor finished, but no recommendation items were returned."
          );
        }

        setChips([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (chip) => {
    if (loading) return;

    if (multi) {
      setSelectedChips((prev) =>
        prev.includes(chip.value)
          ? prev.filter((value) => value !== chip.value)
          : [...prev, chip.value]
      );
    } else {
      sendAnswer(chip.value);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (multi && selectedChips.length) {
      sendAnswer(selectedChips.join(", "));
    } else {
      sendAnswer(input);
    }
  };

  const productDetails = useMemo(() => {
    if (!recommendation) return [];

    return recommendation.items.map((item) => {
      const product = catalogue.find(
        (p) => String(p.id || p.product_id) === String(item.product_id)
      );

      return { ...item, catalogueProduct: product };
    });
  }, [recommendation, catalogue]);

  const initialSelected = useMemo(() => {
    if (!recommendation) return [];

    return recommendation.items
      .filter((item) => item.on || item.core)
      .map((item) => item.product_id)
      .sort();
  }, [recommendation]);

  const selectionChanged = useMemo(() => {
    return [...selectedProducts].sort().join("|") !== initialSelected.join("|");
  }, [selectedProducts, initialSelected]);

  const selectedItems = productDetails.filter((item) =>
    selectedProducts.includes(item.product_id)
  );

  const estimatedPrice = selectedItems.reduce((total, item) => {
    const price = Number(item.catalogueProduct?.price_min || 0);
    return total + price * Number(item.qty || 1);
  }, 0);

  const displayedPrice = selectionChanged ? estimatedPrice : advisorPrice;

  const toggleProduct = (item) => {
    if (item.core) return;

    const isSelected = selectedProducts.includes(item.product_id);

    if (isSelected) {
      setSelectedProducts((prev) =>
        prev.filter((id) => id !== item.product_id)
      );
      return;
    }

    if (
      item.requires?.length &&
      !item.requires.some((id) => selectedProducts.includes(id))
    ) {
      setError(
        `${item.name} requires a compatible connectivity product to be selected first.`
      );
      return;
    }

    setError("");
    setSelectedProducts((prev) => [...prev, item.product_id]);
  };

  const handleAddToCart = async () => {
    if (!selectedItems.length || adding) return;

    const missingPrices = selectedItems.filter(
      (item) => !item.catalogueProduct
    );

    if (missingPrices.length) {
      setError(
        "Some product details are missing from the catalogue. Please refresh and try again."
      );
      return;
    }

    setAdding(true);
    setError("");

    try {
      for (const item of selectedItems) {
        const product = item.catalogueProduct;

        const success = await addToCart({
          product_id: item.product_id,
          product_name: item.name || product.name,
          category: item.category || product.category,
          description: item.description || product.description,
          unit: item.unit || product.unit,
          price_min_inr_per_month: Number(product.price_min),
          price_max_inr_per_month: Number(product.price_max),
          quantity: Number(item.qty || 1),
        });

        if (!success) {
          throw new Error(`Unable to add ${item.name} to cart.`);
        }
      }
    } catch (err) {
      setError(err.message || "Unable to add bundle to cart.");
    } finally {
      setAdding(false);
    }
  };

  const handleSaveBundle = async () => {
    if (
      !recommendation ||
      !sessionId ||
      !selectedItems.length ||
      saving ||
      saved
    ) return;

    setSaving(true);
    setError("");

    try {
      if (selectedItems.some((item) => !item.catalogueProduct)) {
        throw new Error("Some product details are missing. Please refresh and try again.");
      }

      const products = selectedItems.map((item) => {
        const product = item.catalogueProduct;

        return {
          product_id: item.product_id,
          product_name: item.name || product.name,
          category: item.category || product.category,
          description: item.description || product.description,
          unit: item.unit || product.unit,
          price_min_inr_per_month: Number(product.price_min),
          price_max_inr_per_month: Number(product.price_max),
          quantity: Number(item.qty || 1),
        };
      });

      const summary = messages
        .filter((message) => message.role === "advisor")
        .map((message) => message.text)
        .filter(Boolean)
        .at(-1) || "A bundle recommended by Udyam Saathi.";

      await profileApi.saveBundle({
        bundleId: sessionId,
        name: "Udyam Saathi Recommendation",
        description: "A personalized Accel Business bundle for your business needs.",
        reason: summary,
        monthlyPrice: Number(displayedPrice ?? estimatedPrice ?? 0),
        products,
      });

      setSaved(true);
    } catch (err) {
      setError(err.message || "Unable to save this bundle. Please sign in and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (pathname !== "/for-you") return null;

  return (
    <main className="bundle-page">
      <section className="bundle-card">
        <header className="bundle-header">
          <div className="bundle-header__icon">
            <Sparkles size={22} />
          </div>

          <div>
            <h1>Udyam Saathi</h1>
            <p>Your Accel Business advisor</p>
          </div>

          <button
            className="bundle-reset"
            onClick={startAdvisor}
            disabled={loading || adding}
            title="Start again"
          >
            <RotateCcw size={18} />
          </button>
        </header>

        <div className="bundle-progress">
          <div className="bundle-progress__labels">
            <span>Finding your perfect bundle</span>
            <strong>{progress}%</strong>
          </div>

          <div className="bundle-progress__track">
            <div
              className="bundle-progress__fill"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        <div className="bundle-chat" ref={chatContainerRef}>
          {messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`bundle-message bundle-message--${message.role}`}
            >
              {message.text}
            </div>
          ))}

          {loading && (
            <div className="bundle-message bundle-message--advisor bundle-typing">
              Thinking...
            </div>
          )}
        </div>

        {error && <p className="bundle-error">{error}</p>}

        {chips.length > 0 && !recommendation && (
          <div className="bundle-options">
            {chips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                className={`bundle-chip ${
                  selectedChips.includes(chip.value)
                    ? "bundle-chip--selected"
                    : ""
                }`}
                onClick={() => handleChipClick(chip)}
                disabled={loading}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {!recommendation && (
          <form className="bundle-input" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type your answer here..."
              disabled={loading || !sessionId}
            />

            <button
              type="submit"
              disabled={
                loading || (!input.trim() && !(multi && selectedChips.length))
              }
            >
              {multi && selectedChips.length ? "Done ✓" : <Send size={19} />}
            </button>
          </form>
        )}

        {recommendation && (
          <section className="bundle-proposal">
            <div className="bundle-proposal__intro">
              <span className="bundle-proposal__eyebrow">
                <Sparkles size={15} /> PERSONALIZED FOR YOUR BUSINESS
              </span>

              <h2>Your recommended bundle</h2>

              <p>
                A solution selected by Udyam Saathi based on your business
                needs.
              </p>
            </div>

            <div className="bundle-price">
              <div>
                <span className="bundle-price__label">
                  {selectionChanged
                    ? "Estimated starting price"
                    : "Your advisor quote"}
                </span>

                <div className="bundle-price__amount">
                  {displayedPrice !== null
                    ? formatPrice(displayedPrice)
                    : "Price unavailable"}
                  <span>/month</span>
                </div>

                <p>
                  {selectionChanged
                    ? "Based on catalogue starting prices. + GST"
                    : "+ GST · As quoted by your advisor"}
                </p>
              </div>

              <div className="bundle-price__badge">
                <Check size={15} /> Recommended
              </div>
            </div>

            <div className="bundle-products-heading">
              <h3>Products for your business</h3>
              <span>{selectedProducts.length} selected</span>
            </div>

            <div className="bundle-products">
              {productDetails.map((item) => {
                const selected = selectedProducts.includes(item.product_id);
                const price = item.catalogueProduct?.price_min;
                const compatible =
                  !item.requires?.length ||
                  item.requires.some((id) => selectedProducts.includes(id));

                return (
                  <article
                    className={`bundle-product ${
                      selected ? "bundle-product--selected" : ""
                    }`}
                    key={item.product_id}
                  >
                    <div className="bundle-product__top">
                      <div className="bundle-product__identity">
                        <span className="bundle-product__category">
                          {item.category}
                        </span>
                        <h4>{item.name}</h4>
                      </div>

                      {item.core ? (
                        <span className="bundle-tag bundle-tag--core">
                          Core
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`bundle-toggle ${
                            selected ? "bundle-toggle--active" : ""
                          }`}
                          onClick={() => toggleProduct(item)}
                          disabled={!compatible && !selected}
                          aria-label={`${selected ? "Remove" : "Add"} ${item.name}`}
                        >
                          {selected ? <Check size={16} /> : <Plus size={16} />}
                          {selected ? "Added" : "Add"}
                        </button>
                      )}
                    </div>

                    <p className="bundle-product__description">
                      {item.description}
                    </p>

                    <p className="bundle-product__reason">
                      <Sparkles size={14} /> {item.why}
                    </p>

                    <div className="bundle-product__bottom">
                      <span>
                        Qty: <strong>{item.qty}</strong> {item.unit}
                      </span>

                      <span>
                        {price !== undefined
                          ? `${formatPrice(Number(price) * Number(item.qty || 1))}/mo onwards`
                          : "Price unavailable"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="bundle-proposal__footer">
              <div>
                <strong>{selectedItems.length} products selected</strong>
                <p>Products will be added with the recommended quantities.</p>
              </div>

              <div className="bundle-proposal__actions">
                <button
                  className="bundle-save"
                  onClick={handleSaveBundle}
                  disabled={saving || saved || !selectedItems.length}
                >
                  {saved ? <Check size={17} /> : <Bookmark size={17} />}
                  {saving ? "Saving..." : saved ? "Saved to Profile" : "Save Bundle"}
                </button>

                <button
                  className="bundle-add-cart"
                  onClick={handleAddToCart}
                  disabled={adding || !selectedItems.length}
                >
                  <ShoppingCart size={18} />
                  {adding ? "Adding to cart..." : "Add selected products to Cart"}
                </button>
              </div>
            </div>

            <button
              className="bundle-restart"
              onClick={startAdvisor}
              disabled={loading || adding}
            >
              <RotateCcw size={15} /> Build another bundle
            </button>
          </section>
        )}
      </section>
    </main>
  );
}

export default Bundle;
