import rawCsv from './product_catalogue.csv?raw';

const HEADER_FIELDS = [
  'product_id',
  'category',
  'product_name',
  'description',
  'unit',
  'price_min_inr_per_month',
  'price_max_inr_per_month',
  'one_time_setup_inr',
  'min_contract_months',
  'available_city_tiers',
  'min_employees',
  'min_sites',
  'requires_gstin',
  'requires_one_of',
  'typical_install_days',
  'target_segments',
];

const NUMERIC_FIELDS = [
  'price_min_inr_per_month',
  'price_max_inr_per_month',
  'one_time_setup_inr',
  'min_contract_months',
  'min_employees',
  'min_sites',
  'typical_install_days',
];

const SEMICOLON_FIELDS = ['available_city_tiers', 'target_segments'];

function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function castValue(value, field) {
  if (NUMERIC_FIELDS.includes(field)) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  if (SEMICOLON_FIELDS.includes(field)) {
    return value
      ? value
          .split(';')
          .map((segment) => segment.trim())
          .filter(Boolean)
      : [];
  }
  if (field === 'requires_gstin') {
    return value === 'Y';
  }
  if (field === 'requires_one_of') {
    return value
      ? value
          .split('|')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];
  }
  return value;
}

function parseCsv(csv) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const product = {};
    HEADER_FIELDS.forEach((field, index) => {
      product[field] = castValue(values[index] ?? '', field);
    });
    return product;
  });
}

export const products = parseCsv(rawCsv);

export const categories = (() => {
  const grouped = {};
  products.forEach((product) => {
    if (!grouped[product.category]) {
      grouped[product.category] = [];
    }
    grouped[product.category].push(product);
  });
  return Object.entries(grouped).map(([name, items]) => ({
    name,
    products: items,
    count: items.length,
  }));
})();

export const categoryDescriptions = {
  Connectivity:
    'Business broadband, leased lines, mobile plans and failover to keep every site online.',
  Communication:
    'Cloud telephony, toll-free numbers, SMS and WhatsApp to reach customers reliably.',
  'Cloud & Productivity':
    'Email, backup, websites and billing tools that power day-to-day operations.',
  Security:
    'Endpoint protection, managed firewalls and secure Wi-Fi to safeguard your business.',
  'IoT & Physical':
    'Cloud CCTV, machine monitoring and fleet tracking for connected operations.',
};

export const categoryIcons = {
  Connectivity: 'Wifi',
  Communication: 'PhoneCall',
  'Cloud & Productivity': 'Cloud',
  Security: 'ShieldCheck',
  'IoT & Physical': 'Cctv',
};

export const categoryList = categories.map((category) => category.name);

export const allSegments = (() => {
  const segmentSet = new Set();
  products.forEach((product) =>
    product.target_segments.forEach((segment) => segmentSet.add(segment)),
  );
  return Array.from(segmentSet).sort();
})();

export const priceBounds = (() => {
  const minPrices = products.map((product) => product.price_min_inr_per_month);
  const maxPrices = products.map((product) => product.price_max_inr_per_month);
  return {
    min: Math.min(...minPrices),
    max: Math.max(...maxPrices),
  };
})();

export function getProductsBySegment(segment) {
  return products.filter((product) => product.target_segments.includes(segment));
}

export function getFeaturedProducts(segmentList = ['micro', 'prof']) {
  return products.filter((product) =>
    product.target_segments.some((segment) => segmentList.includes(segment)),
  );
}

export function getCategoryByName(name) {
  return categories.find((category) => category.name === name);
}

export function formatPrice(value) {
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

export function formatPriceRange(min, max) {
  if (min === max) return formatPrice(min);
  return `${formatPrice(min)} – ${formatPrice(max)}`;
}

export function getProductNamesByIds(ids) {
  if (!ids || ids.length === 0) return [];
  return ids
    .map((id) => products.find((product) => product.product_id === id))
    .filter(Boolean)
    .map((product) => product.product_name);
}
