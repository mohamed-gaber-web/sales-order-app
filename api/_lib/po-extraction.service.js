/**
 * Turns a photo of a paper purchase order into a structured extraction.
 *
 * Framework-agnostic on purpose: no req/res in here. The route validates the
 * input and passes plain values in.
 *
 * Required environment variable:
 *   ANTHROPIC_API_KEY — set it in the Vercel dashboard (production) or your
 *                       shell / .env before `npm run dev:api` (local).
 */

const { Anthropic } = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16000;

/** Beta flag for server-side refusal fallbacks. Dropped automatically if the account lacks it. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const SYSTEM_PROMPT = `You read photographs and scans of paper purchase-order paperwork for a warehouse receiving app, and return the data as structured JSON.

The photo is usually taken on a phone, on a warehouse floor or a loading dock. Expect glare, shadow, skew, creases, staples, stamps, and handwritten annotations in the margins.

Rules:
- Transcribe what is printed. Never invent a value you cannot read, and never complete a partial code from your own guess of what it should be.
- The purchase order number is the number the *buyer* issued. It is normally labelled "Purchase Order", "PO No.", "Order No.", or "P/O". Do not return the vendor's invoice, quote, or delivery-note number in that field.
- Item numbers are the buyer's part codes, usually in the leftmost column of the line table. Keep their exact punctuation and letter case.
- Quantities: read the *ordered* quantity column unless the document only shows a delivered/shipped quantity. Use a period as the decimal separator and no thousands separator, so "1.234,50" becomes 1234.50 and "1,234.50" becomes 1234.50.
- Handwritten corrections override the printed value they strike through. Mention any such override in "notes".
- Skip subtotal, tax, freight, and total rows. They are not line items.
- If a value is unreadable or absent, return an empty string for text and 0 for numbers. Do not use placeholders like "N/A" or "unknown".
- Set "confidence" to "low" whenever the image is blurred, cropped, or partly illegible, or when you had to make a judgement call about which number is the PO number.
- Use "notes" for anything the receiving clerk should check by eye: unreadable lines, ambiguous quantities, a second page implied by "1 of 2", handwritten edits.`;

const USER_PROMPT = `Extract the purchase order from this document photo. Return every line item you can read in the line table.`;

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'documentType',
    'poNumber',
    'vendorName',
    'vendorAccount',
    'orderDate',
    'currencyCode',
    'confidence',
    'notes',
    'lines',
  ],
  properties: {
    documentType: {
      type: 'string',
      enum: ['purchase_order', 'delivery_note', 'packing_slip', 'invoice', 'other'],
      description: 'What the document actually is, judged from its own heading.',
    },
    poNumber: {
      type: 'string',
      description: 'The buyer-issued purchase order number, exactly as printed. Empty string if not present.',
    },
    vendorName: { type: 'string', description: 'Supplier / vendor company name as printed.' },
    vendorAccount: { type: 'string', description: 'Vendor account or supplier code, if the document shows one.' },
    orderDate: { type: 'string', description: 'Order date as printed, in YYYY-MM-DD when the format is unambiguous.' },
    currencyCode: { type: 'string', description: 'Three-letter currency code, e.g. USD. Empty string if not shown.' },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How much of the document could be read cleanly.',
    },
    notes: {
      type: 'string',
      description: 'What a receiving clerk should verify by eye. Empty string if nothing stands out.',
    },
    lines: {
      type: 'array',
      description: 'One entry per line item in the order table, in the order they appear.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['lineNumber', 'itemNumber', 'description', 'quantity', 'unit', 'unitPrice'],
        properties: {
          lineNumber: { type: 'integer', description: 'Line number as printed, or its 1-based position in the table.' },
          itemNumber: { type: 'string', description: "The buyer's item / part code. Empty string if the row has none." },
          description: { type: 'string', description: 'Item description text.' },
          quantity: { type: 'number', description: 'Ordered quantity as a plain number. 0 if unreadable.' },
          unit: { type: 'string', description: 'Unit of measure, e.g. PCS, KG, EA.' },
          unitPrice: { type: 'number', description: 'Price per unit. 0 if the document does not show prices.' },
        },
      },
    },
  },
};

/** Thrown for conditions the route should translate into a specific client response. */
class ExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
  }
}

let client = null;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fail fast with a clear message — and never echo the value of anything secret.
    throw new ExtractionError('not_configured', 'ANTHROPIC_API_KEY is not set on the server.');
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

function buildRequest({ image, mediaType }) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  };
}

/**
 * A refusal on receiving paperwork would be surprising, but the response is a
 * normal 200 when it happens — so it has to be checked before reading content.
 */
async function callModel(anthropic, request) {
  try {
    return await anthropic.beta.messages.create({
      ...request,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    });
  } catch (err) {
    // Match on the wire status rather than the SDK's error class, so this keeps
    // working if the class binding moves between SDK versions.
    const unsupportedBeta = err?.status === 400 && /fallback|beta/i.test(err?.message ?? '');
    if (!unsupportedBeta) throw err;
    // The workspace does not have server-side fallbacks enabled — the extraction
    // itself is unaffected, so run it without them.
    return anthropic.messages.create(request);
  }
}

function readJsonBlock(response) {
  // With thinking enabled the first block is not the answer — find the text block.
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || typeof textBlock.text !== 'string' || textBlock.text.trim() === '') {
    throw new ExtractionError('empty_response', 'The model returned no extraction.');
  }
  try {
    return JSON.parse(textBlock.text);
  } catch {
    throw new ExtractionError('unparseable_response', 'The model returned malformed JSON.');
  }
}

/**
 * @param {{ image: string, mediaType: string }} input - validated by api/_lib/ocr-request.js
 * @returns {Promise<object>} an object matching EXTRACTION_SCHEMA
 */
async function extractPurchaseOrder(input) {
  const anthropic = getClient();
  const response = await callModel(anthropic, buildRequest(input));

  if (response.stop_reason === 'refusal') {
    throw new ExtractionError('refused', 'The model declined to read this document.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ExtractionError('truncated', 'The document has more lines than one pass can return.');
  }

  return readJsonBlock(response);
}

module.exports = { extractPurchaseOrder, ExtractionError, MODEL };
