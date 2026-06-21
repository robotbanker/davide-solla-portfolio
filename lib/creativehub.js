const crypto = require("crypto");
const { loadLocalEnv } = require("./env");
const { rateLimitRequest } = require("./security");

const defaultBaseUrl = "https://api.creativehub.io";
const defaultPageSize = 100;

loadLocalEnv();

const jsonResponse = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
};

const cleanBaseUrl = (value) => String(value || defaultBaseUrl).replace(/\/+$/, "");

const creativehubConfig = () => ({
  apiKey: process.env.CREATIVEHUB_API_KEY || "",
  baseUrl: cleanBaseUrl(process.env.CREATIVEHUB_API_BASE_URL),
  pageSize: Math.min(Math.max(Number(process.env.CREATIVEHUB_PRODUCTS_PAGE_SIZE || defaultPageSize), 1), 250),
  maxPages: Math.min(Math.max(Number(process.env.CREATIVEHUB_PRODUCTS_MAX_PAGES || 10), 1), 50),
  orderCountryCode: process.env.CREATIVEHUB_ORDER_COUNTRY_CODE || "GB",
  fulfillmentLabel: process.env.CREATIVEHUB_FULFILLMENT_LABEL || "UK-first print fulfilment",
  leadTime: process.env.CREATIVEHUB_LEAD_TIME || "Typical production and dispatch: 2-5 working days after fulfilment is accepted."
});

const paymentConfig = () => ({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  fallbackPaymentUrl: process.env.PRINT_PAYMENT_URL || "",
  orderTokenSecret: process.env.PRINT_ORDER_TOKEN_SECRET || process.env.CREATIVEHUB_API_KEY || "",
  tokenMaxAgeMs: Math.min(Math.max(Number(process.env.PRINT_ORDER_TOKEN_MAX_AGE_MINUTES || 30), 5), 180) * 60 * 1000
});

const formatMoney = (amount, currencyCode = "GBP") => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode || "GBP",
      maximumFractionDigits: numericAmount % 1 === 0 ? 0 : 2
    }).format(numericAmount);
  } catch (error) {
    return `${currencyCode || "GBP"} ${numericAmount.toFixed(numericAmount % 1 === 0 ? 0 : 2)}`;
  }
};

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

const roundDimension = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  return String(Math.round(number));
};

const dimensionLabel = (option) => {
  if (option.ShortDescription) {
    return option.ShortDescription;
  }

  if (option.VariantDescription) {
    return option.VariantDescription;
  }

  if (option.WidthMM && option.HeightMM) {
    return `${roundDimension(option.WidthMM)} x ${roundDimension(option.HeightMM)} mm`;
  }

  if (option.ShortSideMM && option.LongSideMM) {
    return `${roundDimension(option.ShortSideMM)} x ${roundDimension(option.LongSideMM)} mm`;
  }

  return "";
};

const editionLabel = (options) => {
  const editionOption = options.find((option) => option.SellAsEdition);

  if (!editionOption) {
    return "Open edition";
  }

  return editionOption.EditionsLimit
    ? `Limited edition of ${editionOption.EditionsLimit}`
    : "Limited edition";
};

const productPaper = (product, options) => {
  const optionPaper = options.find((option) => option.SubstrateDescription)?.SubstrateDescription;
  return product.Paper || product.PrintType || optionPaper || "Creativehub print product";
};

const productDescription = (product, options) => {
  const optionDescription = options.find((option) => option.FullDescription || option.Description)?.FullDescription
    || options.find((option) => option.FullDescription || option.Description)?.Description;

  return product.Description || optionDescription || "";
};

const publicImageUrl = (value) => {
  const url = String(value || "");
  return /^https?:\/\//i.test(url) ? url : "";
};

const creativehubPreviewUrl = (value) => {
  const path = String(value || "").replace(/^\/+/, "");
  const parts = path.split("/");

  if (parts.length !== 3 || !parts[0] || !parts[2] || !/\.(jpe?g|png|webp)$/i.test(parts[2])) {
    return "";
  }

  return `https://app.creativehub.io/file-preview/api/file/pshubcontainer/${encodeURIComponent(parts[0])}/medium/${encodeURIComponent(parts[2])}`;
};

const productImageUrl = (product) => publicImageUrl(product.ThumbnailUrl)
  || creativehubPreviewUrl(product.ThumbnailUrl)
  || (product.StoragePrefix && product.GUID
    ? `https://app.creativehub.io/file-preview/api/file/pshubcontainer/${encodeURIComponent(product.StoragePrefix)}/medium/${encodeURIComponent(`${product.GUID}.jpg`)}`
    : "");

const availablePrintOptions = (product) => (product.PrintOptions || [])
  .filter((option) => option && option.IsAvailable !== false && option.DoNotPrint !== true);

const mapProductToPrint = (product, config) => {
  const options = availablePrintOptions(product);

  if (!product || !product.Id || !options.length) {
    return null;
  }

  const sortedByPrice = [...options]
    .filter((option) => Number.isFinite(Number(option.Price)))
    .sort((a, b) => Number(a.Price) - Number(b.Price));
  const lowestPrice = sortedByPrice[0];
  const currencyCode = lowestPrice?.CurrencyCode || options.find((option) => option.CurrencyCode)?.CurrencyCode || "GBP";
  const sizes = uniqueValues(options.map(dimensionLabel));

  return {
    id: `creativehub-${product.Id}`,
    creativehubProductId: product.Id,
    title: product.DisplayName || product.FileName || `Creativehub Product ${product.Id}`,
    series: product.ArtistName || product.UserDefaultArtistName || "Creativehub print",
    image: productImageUrl(product),
    alt: product.DisplayName || product.FileName || "Creativehub print product",
    description: productDescription(product, options),
    paper: productPaper(product, options),
    edition: editionLabel(options),
    fromPrice: lowestPrice ? `From ${formatMoney(lowestPrice.Price, currencyCode)}` : "Price on request",
    sizes,
    fulfillment: config.fulfillmentLabel,
    creativehubUrl: product.ProductUrl || product.StoreUrl || product.Url || "",
    printOptions: options.map((option) => ({
      id: option.Id,
      externalSku: option.ExternalSku || "",
      price: option.Price,
      currencyCode: option.CurrencyCode || currencyCode,
      size: dimensionLabel(option),
      frame: option.FrameDescription || option.FrameTypeDescription || "",
      editionLimit: option.EditionsLimit || null,
      editionsSold: option.EditionsSold || null
    }))
  };
};

const creativehubRequest = async (path, options, config) => {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      authorization: `ApiKey ${config.apiKey}`,
      "content-type": "application/json",
      ...(options?.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    let nestedBody = {};

    if (typeof body.Message === "string" && body.Message.trim().startsWith("{")) {
      try {
        nestedBody = JSON.parse(body.Message);
      } catch (parseError) {
        nestedBody = {};
      }
    }

    const errorBody = {
      ...body,
      ...nestedBody
    };
    const error = new Error(errorBody.message || errorBody.Message || errorBody.developerMessage || "Creativehub request failed");
    error.statusCode = response.status;
    error.body = errorBody;
    throw error;
  }

  return body;
};

const readJsonBody = (req) => new Promise((resolve, reject) => {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;

    if (body.length > 32_000) {
      reject(new Error("Request body is too large."));
      req.destroy();
    }
  });

  req.on("end", () => {
    if (!body) {
      resolve({});
      return;
    }

    try {
      resolve(JSON.parse(body));
    } catch (error) {
      reject(new Error("Order details could not be read."));
    }
  });

  req.on("error", reject);
});

const readRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;

  req.on("data", (chunk) => {
    size += chunk.length;

    if (size > 256_000) {
      reject(new Error("Request body is too large."));
      req.destroy();
      return;
    }

    chunks.push(chunk);
  });

  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const cleanText = (value, maxLength = 160) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const parsePositiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
};

const toMinorUnits = (amount) => Math.round(Number(amount || 0) * 100);

const publicOrderError = (message, statusCode = 400, code = "print_order_error") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = code;
  return error;
};

const encodeBase64Url = (value) => Buffer.from(JSON.stringify(value))
  .toString("base64url");

const decodeBase64Url = (value) => JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));

const createOrderToken = (payload, secret) => {
  if (!secret) {
    throw publicOrderError("Payment checkout is not configured yet.", 503, "payment_not_configured");
  }

  const encodedPayload = encodeBase64Url(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
};

const verifyOrderToken = (token, secret) => {
  if (!secret) {
    throw publicOrderError("Payment checkout is not configured yet.", 503, "payment_not_configured");
  }

  const [encodedPayload, signature] = String(token || "").split(".");

  if (!encodedPayload || !signature) {
    throw publicOrderError("Payment checkout details are missing. Please restart the print order.", 400, "payment_token_missing");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  if (
    signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw publicOrderError("Payment checkout details have expired. Please restart the print order.", 400, "payment_token_invalid");
  }

  const payload = decodeBase64Url(encodedPayload);

  if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) {
    throw publicOrderError("Payment checkout details have expired. Please restart the print order.", 400, "payment_token_expired");
  }

  return payload;
};

const stripeSignatureParts = (value) => String(value || "")
  .split(",")
  .reduce((parts, entry) => {
    const [key, signatureValue] = entry.split("=");

    if (key && signatureValue) {
      parts[key] = parts[key] || [];
      parts[key].push(signatureValue);
    }

    return parts;
  }, {});

const verifyStripeWebhookEvent = (rawBody, signatureHeader) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";

  if (!secret) {
    throw publicOrderError("Stripe webhook signing secret is not configured.", 503, "stripe_webhook_not_configured");
  }

  const parts = stripeSignatureParts(signatureHeader);
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];

  if (!timestamp || !signatures.length) {
    throw publicOrderError("Stripe webhook signature is missing.", 400, "stripe_signature_missing");
  }

  const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);

  if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) {
    throw publicOrderError("Stripe webhook signature has expired.", 400, "stripe_signature_expired");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");
  const isValid = signatures.some((signature) => (
    signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ));

  if (!isValid) {
    throw publicOrderError("Stripe webhook signature is invalid.", 400, "stripe_signature_invalid");
  }

  return JSON.parse(rawBody.toString("utf8"));
};

const queryCreativehubProducts = async (config) => {
  let page = 1;
  let total = Infinity;
  const products = [];

  while (products.length < total && page <= config.maxPages) {
    const body = await creativehubRequest("/api/v1/products/query", {
      method: "POST",
      body: JSON.stringify({
        Page: page,
        PageSize: config.pageSize,
        Sorts: [
          {
            Member: "DisplayName",
            SortDirection: "Ascending"
          }
        ]
      })
    }, config);

    const data = Array.isArray(body.Data) ? body.Data : [];
    total = Number.isFinite(Number(body.Total)) ? Number(body.Total) : data.length;
    products.push(...data);

    if (!data.length) {
      break;
    }

    page += 1;
  }

  return products;
};

const queryCreativehubCountries = async (config) => {
  const body = await creativehubRequest("/api/v1/countries/query", {
    method: "POST",
    body: JSON.stringify({
      Page: 1,
      PageSize: 250,
      Sorts: [
        {
          Member: "Name",
          SortDirection: "Ascending"
        }
      ]
    })
  }, config);

  return Array.isArray(body.Data) ? body.Data : [];
};

const creativehubDeliveryCountry = async (config) => {
  const countries = await queryCreativehubCountries(config);
  const preferredCode = config.orderCountryCode.toUpperCase();
  const country = countries.find((item) => String(item.Code || "").toUpperCase() === preferredCode)
    || countries.find((item) => /united kingdom/i.test(item.Name || ""));

  if (!country) {
    throw publicOrderError("Creativehub UK delivery could not be found right now.", 502, "creativehub_country_unavailable");
  }

  return country;
};

const findOrderProduct = async (config, productId, printOptionId) => {
  const products = await queryCreativehubProducts(config);
  const product = products.find((item) => Number(item.Id) === productId);

  if (!product) {
    throw publicOrderError("This print is no longer available.", 404, "print_product_unavailable");
  }

  const option = availablePrintOptions(product).find((item) => Number(item.Id) === printOptionId);

  if (!option) {
    throw publicOrderError("This print size is no longer available.", 404, "print_option_unavailable");
  }

  return { product, option };
};

const orderCustomerDetails = (payload) => {
  const shipping = payload.shippingAddress || {};
  const firstName = cleanText(payload.firstName || shipping.firstName, 80);
  const lastName = cleanText(payload.lastName || shipping.lastName, 80);
  const email = cleanText(payload.email, 160);
  const phone = cleanText(payload.phone || shipping.phone, 60);
  const line1 = cleanText(shipping.line1, 160);
  const line2 = cleanText(shipping.line2, 160);
  const town = cleanText(shipping.town, 100);
  const county = cleanText(shipping.county, 100);
  const postCode = cleanText(shipping.postCode, 24).toUpperCase();

  if (!firstName || !lastName || !email || !phone || !line1 || !town || !postCode) {
    throw publicOrderError("Please complete the delivery details before continuing.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw publicOrderError("Please enter a valid email address.");
  }

  return {
    firstName,
    lastName,
    email,
    phone,
    line1,
    line2,
    town,
    county,
    postCode
  };
};

const deliveryOptionPrice = (option) => {
  const excludingTax = Number(option.DeliveryChargeExcludingSalesTax || 0);
  const tax = Number(option.DeliveryChargeSalesTax || 0);
  return Number((excludingTax + tax).toFixed(2));
};

const mapDeliveryOption = (option, currencyCode) => ({
  id: option.Id,
  branchName: option.BranchName || "",
  method: option.Method || "Delivery",
  deliveryTime: option.DeliveryTime || "",
  price: deliveryOptionPrice(option),
  priceLabel: formatMoney(deliveryOptionPrice(option), currencyCode),
  estimatedFrom: option.EstimatedDeliveryDateFrom || "",
  estimatedTo: option.EstimatedDeliveryDateTo || "",
  deliveryChargeExcludingSalesTax: option.DeliveryChargeExcludingSalesTax,
  deliveryChargeSalesTax: option.DeliveryChargeSalesTax
});

const creativehubAccountSetupError = (error) => {
  const body = error.body || {};
  const message = `${body.Message || ""} ${body.message || ""} ${body.developerMessage || ""}`.trim();
  return error.statusCode === 409 && /credit card is not set/i.test(message);
};

const createCreativehubDraftOrder = async (payload) => {
  const config = creativehubConfig();
  const payments = paymentConfig();

  if (!config.apiKey) {
    throw publicOrderError("Creativehub API connection is not ready yet.", 503, "creativehub_not_configured");
  }

  const productId = parsePositiveInteger(payload.productId);
  const printOptionId = parsePositiveInteger(payload.printOptionId);
  const quantity = Math.min(Math.max(parsePositiveInteger(payload.quantity) || 1, 1), 10);

  if (!productId || !printOptionId) {
    throw publicOrderError("Please choose a print and size before continuing.");
  }

  const customer = orderCustomerDetails(payload);
  const country = await creativehubDeliveryCountry(config);
  const { product, option } = await findOrderProduct(config, productId, printOptionId);
  const currencyCode = option.CurrencyCode || "GBP";
  const externalReference = `davide-solla-web-${Date.now()}`;
  const order = await creativehubRequest("/api/v1/orders/embryonic", {
    method: "POST",
    body: JSON.stringify({
      Id: 0,
      ExternalReference: externalReference,
      FirstName: customer.firstName,
      LastName: customer.lastName,
      Email: customer.email,
      MessageToLab: "Website print order created by Davide Solla portfolio.",
      ShippingAddress: {
        FirstName: customer.firstName,
        LastName: customer.lastName,
        Line1: customer.line1,
        Line2: customer.line2,
        Town: customer.town,
        County: customer.county,
        PostCode: customer.postCode,
        CountryId: country.Id,
        CountryCode: country.Code,
        CountryName: country.Name,
        PhoneNumber: customer.phone
      },
      OrderItems: [
        {
          Id: 0,
          ProductId: productId,
          PrintOptionId: printOptionId,
          Quantity: quantity,
          ExternalReference: externalReference,
          ExternalSku: option.ExternalSku || ""
        }
      ]
    })
  }, config);

  const deliveryOptions = Array.isArray(order.DeliveryOptions)
    ? order.DeliveryOptions.map((deliveryOption) => mapDeliveryOption(deliveryOption, currencyCode))
    : [];
  const retailSubtotal = Number((Number(option.Price || 0) * quantity).toFixed(2));
  const orderToken = createOrderToken({
    orderId: order.Id,
    externalReference,
    customer: {
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName
    },
    product: {
      id: product.Id,
      title: product.DisplayName || product.FileName || `Creativehub Product ${product.Id}`,
      image: productImageUrl(product)
    },
    option: {
      id: option.Id,
      size: dimensionLabel(option),
      price: Number(option.Price || 0),
      priceLabel: formatMoney(option.Price, currencyCode),
      currencyCode
    },
    quantity,
    retailSubtotal,
    retailSubtotalLabel: formatMoney(retailSubtotal, currencyCode),
    deliveryOptions,
    expiresAt: Date.now() + payments.tokenMaxAgeMs
  }, payments.orderTokenSecret);

  return {
    version: 1,
    source: "creativehub",
    status: "draft",
    orderId: order.Id,
    orderToken,
    externalReference,
    message: "Creativehub draft order ready.",
    product: {
      id: product.Id,
      title: product.DisplayName || product.FileName || `Creativehub Product ${product.Id}`,
      image: productImageUrl(product)
    },
    option: {
      id: option.Id,
      size: dimensionLabel(option),
      price: Number(option.Price || 0),
      priceLabel: formatMoney(option.Price, currencyCode),
      currencyCode
    },
    quantity,
    retailSubtotal,
    retailSubtotalLabel: formatMoney(retailSubtotal, currencyCode),
    deliveryOptions,
    canConfirmFulfillment: false
  };
};

const requestOrigin = (req) => {
  const configuredUrl = process.env.PUBLIC_SITE_URL || "https://www.davidesolla.com";
  const host = String(req.headers.host || "");

  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    return `http://${host}`;
  }

  try {
    const url = new URL(configuredUrl);

    if (["http:", "https:"].includes(url.protocol)) {
      return url.origin;
    }
  } catch (error) {
    // Configuration is checked below using the safe production default.
  }

  return "https://www.davidesolla.com";
};

const appendPaymentParams = (baseUrl, params) => {
  const url = new URL(baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const stripeCheckoutSession = async (checkout, origin) => {
  const payments = paymentConfig();

  if (!payments.stripeSecretKey) {
    return null;
  }

  const currency = String(checkout.option.currencyCode || "GBP").toLowerCase();
  const successUrl = process.env.PRINT_CHECKOUT_SUCCESS_URL
    || `${origin}/index.html?print-payment=success&session_id={CHECKOUT_SESSION_ID}#print-shop`;
  const cancelUrl = process.env.PRINT_CHECKOUT_CANCEL_URL
    || `${origin}/index.html?print-payment=cancelled#print-shop`;
  const body = new URLSearchParams();
  const deliveryAmount = toMinorUnits(checkout.deliveryOption.price);

  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("customer_email", checkout.customer.email);
  body.set("client_reference_id", checkout.externalReference);
  body.set("line_items[0][price_data][currency]", currency);
  body.set("line_items[0][price_data][unit_amount]", String(toMinorUnits(checkout.option.price)));
  body.set("line_items[0][price_data][product_data][name]", `${checkout.product.title} - ${checkout.option.size || "Print"}`);
  body.set("line_items[0][quantity]", String(checkout.quantity));
  body.set("metadata[ch_order_id]", String(checkout.orderId));
  body.set("metadata[ch_delivery_option_id]", String(checkout.deliveryOption.id));
  body.set("metadata[ch_del_ex_tax]", String(checkout.deliveryOption.deliveryChargeExcludingSalesTax || 0));
  body.set("metadata[ch_del_tax]", String(checkout.deliveryOption.deliveryChargeSalesTax || 0));
  body.set("metadata[ch_ext_ref]", checkout.externalReference);
  body.set("payment_intent_data[metadata][ch_order_id]", String(checkout.orderId));
  body.set("payment_intent_data[metadata][ch_delivery_option_id]", String(checkout.deliveryOption.id));
  body.set("payment_intent_data[metadata][ch_del_ex_tax]", String(checkout.deliveryOption.deliveryChargeExcludingSalesTax || 0));
  body.set("payment_intent_data[metadata][ch_del_tax]", String(checkout.deliveryOption.deliveryChargeSalesTax || 0));

  if (checkout.product.image) {
    body.set("line_items[0][price_data][product_data][images][0]", checkout.product.image);
  }

  if (deliveryAmount > 0) {
    body.set("line_items[1][price_data][currency]", currency);
    body.set("line_items[1][price_data][unit_amount]", String(deliveryAmount));
    body.set("line_items[1][price_data][product_data][name]", checkout.deliveryOption.method || "Delivery");
    body.set("line_items[1][quantity]", "1");
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${payments.stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.url) {
    const error = publicOrderError(result.error?.message || "Stripe checkout could not be created.", 502, "stripe_checkout_failed");
    error.body = result;
    throw error;
  }

  return result.url;
};

const createPrintPaymentCheckout = async (payload, req) => {
  const payments = paymentConfig();
  const checkout = verifyOrderToken(payload.orderToken, payments.orderTokenSecret);
  const deliveryOptionId = parsePositiveInteger(payload.deliveryOptionId);
  const deliveryOption = (checkout.deliveryOptions || []).find((option) => Number(option.id) === deliveryOptionId);

  if (!deliveryOption) {
    throw publicOrderError("Choose a valid delivery option before continuing.", 400, "delivery_option_invalid");
  }

  checkout.deliveryOption = deliveryOption;
  checkout.orderTotal = Number((Number(checkout.retailSubtotal || 0) + Number(deliveryOption.price || 0)).toFixed(2));
  checkout.orderTotalLabel = formatMoney(checkout.orderTotal, checkout.option.currencyCode || "GBP");

  const origin = requestOrigin(req);
  const stripeUrl = await stripeCheckoutSession(checkout, origin);
  const fallbackUrl = payments.fallbackPaymentUrl
    ? appendPaymentParams(payments.fallbackPaymentUrl, {
      order: checkout.externalReference,
      product: checkout.product.title,
      amount: checkout.orderTotal,
      currency: checkout.option.currencyCode || "GBP"
    })
    : "";

  if (!stripeUrl && !fallbackUrl) {
    throw publicOrderError("Payment checkout is not configured yet. Add Stripe checkout settings before taking print payments.", 503, "payment_not_configured");
  }

  return {
    version: 1,
    source: stripeUrl ? "stripe" : "payment-link",
    redirectUrl: stripeUrl || fallbackUrl,
    orderTotal: checkout.orderTotal,
    orderTotalLabel: checkout.orderTotalLabel
  };
};

const confirmCreativehubFulfillment = async (metadata) => {
  const config = creativehubConfig();
  const orderId = parsePositiveInteger(metadata.ch_order_id || metadata.creativehub_order_id);
  const deliveryOptionId = parsePositiveInteger(metadata.ch_delivery_option_id || metadata.creativehub_delivery_option_id);
  const deliveryChargeExcludingSalesTax = Number(metadata.ch_del_ex_tax || metadata.creativehub_delivery_charge_excluding_tax || 0);
  const deliveryChargeSalesTax = Number(metadata.ch_del_tax || metadata.creativehub_delivery_charge_sales_tax || 0);

  if (!orderId || !deliveryOptionId) {
    throw publicOrderError("Stripe payment is missing Creativehub order metadata.", 400, "creativehub_metadata_missing");
  }

  if (!config.apiKey) {
    throw publicOrderError("Creativehub API connection is not ready yet.", 503, "creativehub_not_configured");
  }

  return creativehubRequest("/api/v1/orders/confirmed", {
    method: "POST",
    body: JSON.stringify({
      OrderId: orderId,
      DeliveryOptionId: deliveryOptionId,
      DeliveryChargeExcludingSalesTax: Number.isFinite(deliveryChargeExcludingSalesTax) ? deliveryChargeExcludingSalesTax : 0,
      DeliveryChargeSalesTax: Number.isFinite(deliveryChargeSalesTax) ? deliveryChargeSalesTax : 0,
      ExternalReference: metadata.ch_ext_ref || metadata.creativehub_external_reference || ""
    })
  }, config);
};

const fulfillPaidStripeCheckout = async (session) => {
  if (!session || session.mode !== "payment") {
    return { fulfilled: false, reason: "not_payment_session" };
  }

  if (session.payment_status !== "paid") {
    return { fulfilled: false, reason: "payment_not_paid" };
  }

  await confirmCreativehubFulfillment(session.metadata || {});
  return {
    fulfilled: true,
    orderId: session.metadata?.ch_order_id || session.metadata?.creativehub_order_id || ""
  };
};

const handleStripeWebhookRequest = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const event = verifyStripeWebhookEvent(rawBody, req.headers["stripe-signature"]);
    let fulfillment = { fulfilled: false, reason: "event_ignored" };

    if (event.type === "checkout.session.completed") {
      fulfillment = await fulfillPaidStripeCheckout(event.data?.object);
    }

    jsonResponse(res, 200, {
      received: true,
      eventType: event.type,
      fulfillment
    });
  } catch (error) {
    console.error("Stripe webhook failed:", error.message);
    jsonResponse(res, error.publicCode ? error.statusCode : 500, {
      received: false,
      code: error.publicCode || "stripe_webhook_failed",
      error: error.publicCode ? error.message : "Stripe webhook could not be processed."
    });
  }
};

const getCreativehubPrints = async () => {
  const config = creativehubConfig();

  if (!config.apiKey) {
    return {
      version: 1,
      source: "creativehub",
      configured: false,
      settings: {
        leadTime: "Creativehub API connection pending."
      },
      prints: []
    };
  }

  const products = await queryCreativehubProducts(config);
  const prints = products
    .map((product) => mapProductToPrint(product, config))
    .filter(Boolean);

  return {
    version: 1,
    source: "creativehub",
    configured: true,
    settings: {
      currency: prints.find((print) => print.printOptions[0]?.currencyCode)?.printOptions[0]?.currencyCode || "GBP",
      fulfillment: config.fulfillmentLabel,
      leadTime: config.leadTime
    },
    prints
  };
};

const handlePrintsRequest = async (req, res) => {
  if (req.method === "POST") {
    try {
      const payload = await readJsonBody(req);

      const attempt = rateLimitRequest(req, `prints:${payload.action || "unknown"}`, {
        limit: payload.action === "createPayment" ? 20 : 10,
        windowMs: 60 * 60 * 1000
      });

      if (!attempt.allowed) {
        res.setHeader("retry-after", String(attempt.retryAfter));
        throw publicOrderError("Too many order attempts. Please try again later.", 429, "print_rate_limited");
      }

      if (payload.action === "createPayment") {
        jsonResponse(res, 200, await createPrintPaymentCheckout(payload, req));
        return;
      }

      if (payload.action !== "createOrder") {
        jsonResponse(res, 400, { error: "Print order action is not available." });
        return;
      }

      jsonResponse(res, 200, await createCreativehubDraftOrder(payload));
    } catch (error) {
      if (creativehubAccountSetupError(error)) {
        jsonResponse(res, 409, {
          version: 1,
          source: "creativehub",
          code: "creativehub_payment_card_required",
          error: "Creativehub needs a fulfilment payment card before the website can create print orders."
        });
        return;
      }

      console.error("Creativehub order failed:", error.message);
      jsonResponse(res, error.publicCode ? error.statusCode : 502, {
        version: 1,
        source: "creativehub",
        code: error.publicCode || "creativehub_order_failed",
        error: error.publicCode ? error.message : "Creativehub could not create the print order right now."
      });
    }

    return;
  }

  if (req.method !== "GET") {
    res.setHeader("allow", "GET, POST");
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    jsonResponse(res, 200, await getCreativehubPrints());
  } catch (error) {
    console.error("Creativehub product sync failed:", error.message);
    jsonResponse(res, error.statusCode === 401 ? 401 : 502, {
      version: 1,
      source: "creativehub",
      configured: true,
      error: "Creativehub products could not be loaded right now.",
      prints: []
    });
  }
};

module.exports = {
  confirmCreativehubFulfillment,
  createPrintPaymentCheckout,
  getCreativehubPrints,
  createCreativehubDraftOrder,
  handleStripeWebhookRequest,
  handlePrintsRequest
};
