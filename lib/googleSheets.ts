// lib/googleSheets.ts
import { google } from "googleapis";

/** ──────────────────────────────────────────────────────────────────────
 * Env helpers
 * ──────────────────────────────────────────────────────────────────── */
function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Primary spreadsheet id
const SHEET_ID = () => reqEnv("GOOGLE_SHEETS_ID");

// Main tab (bookings append)
const TAB_NAME = () => process.env.GOOGLE_SHEETS_TAB || "Court-Bookings";

// Optional explicit cancel tab NAME. If not provided, we will use/create Sheet #2 (index 1).
const CANCEL_TAB_NAME = () => process.env.GOOGLE_SHEETS_CANCEL_TAB || "";

/** ──────────────────────────────────────────────────────────────────────
 * Auth & Sheets client
 * ──────────────────────────────────────────────────────────────────── */
function getJwt() {
  const clientEmail = reqEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  let privateKey = reqEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  // Fix escaped newlines from .env
  privateKey = privateKey.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheets() {
  const auth = getJwt();
  return google.sheets({ version: "v4", auth });
}

/** ──────────────────────────────────────────────────────────────────────
 * Headers & general helpers
 * ──────────────────────────────────────────────────────────────────── */

// Main header for bookings tab (A..L = 12 cols)
const HEADER = [
  "User Name",
  "Phone",
  "Date",
  "Payment",
  "Amount",
  "Court ID",
  "Start",
  "End",
  "Type",
  "Who",
  "Actions",
  "Booking ID", // ⬅️ We will store orderId here
];

// Cancellation header for Sheet 2 (audit-friendly) (A..P = 16 cols)
const CANCEL_HEADER = [
  "Timestamp",      // A
  "Action",         // B
  "Date",           // C
  "Court ID",       // D
  "Start",          // E
  "End",            // F
  "User Name",      // G
  "Phone",          // H
  "Who",            // I
  "Booking Type",   // J
  "Payment",        // K
  "Amount",         // L
  "Currency",       // M
  "Refund Status",  // N
  "Notes",          // O
  "Order Id",       // P (optional context for audits)
];

/** Convert a 1-based column index to an A1 column label (1->A, 26->Z, 27->AA, ...) */
function toA1Col(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Ensure a header row (A1:…) is present on a given tab name (idempotent). */
async function ensureHeaderForTabName(tabName: string, header: string[]) {
  const sheets = await getSheets();
  const spreadsheetId = SHEET_ID();

  // Try to read the top row matching header length
  const endCol = toA1Col(header.length);
  const read = await sheets.spreadsheets.values
    .get({
      spreadsheetId,
      range: `${tabName}!A1:${endCol}1`,
    })
    .catch(() => ({ data: { values: [] as string[][] } }));

  const values = read.data.values || [];
  const current = values[0] || [];

  const matches =
    current.length === header.length &&
    header.every((h, i) => String(current[i] || "").trim() === h);

  if (matches) return;

  // If the tab may not exist, try adding it (ignore error if already exists)
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
  } catch {
    /* ignore if it already exists */
  }

  // Update header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:${endCol}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [header] },
  });
}

/** Ensure a header row (row 1) is present on a given sheetId (idempotent). */
async function ensureHeaderForSheetId(sheetId: number, header: string[]) {
  const sheets = await getSheets();
  const spreadsheetId = SHEET_ID();

  // Overwrite row 1, columns A..header.length with our header values
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: header.length,
            },
            rows: [
              {
                values: header.map((h) => ({
                  userEnteredValue: { stringValue: h },
                })),
              },
            ],
            fields: "userEnteredValue",
          },
        },
      ],
    },
  });
}

/** Ensure the main (bookings) header exists on its named tab. */
async function ensureMainHeader() {
  await ensureHeaderForTabName(TAB_NAME(), HEADER);
}

/** Get or create the "second tab" (index 1) if no explicit cancel tab is set. */
async function getOrCreateSecondTabSheetId(): Promise<number> {
  const sheets = await getSheets();
  const spreadsheetId = SHEET_ID();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = meta.data.sheets || [];

  // If there is already a second sheet, return it
  if (allSheets.length >= 2) {
    const sheetId = allSheets[1]?.properties?.sheetId;
    if (sheetId != null) return sheetId;
  }

  // Otherwise create a second tab named "Court-Bookings Cancellations"
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: "Court-Bookings Cancellations",
              index: 1, // place it at position 1 (second tab)
            },
          },
        },
      ],
    },
  });

  const reply = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (reply == null) {
    throw new Error("Failed to create second cancellations tab");
  }
  return reply;
}

/** ──────────────────────────────────────────────────────────────────────
 * Public API — Bookings append & update
 * ──────────────────────────────────────────────────────────────────── */

/** Display like your table badge (re-usable across routes) */
function formatPayment(paymentRef?: string, adminPaid?: boolean): string {
  const refUpper = String(paymentRef || "").toUpperCase().trim();

  if (!refUpper) return adminPaid ? "PAID" : "UNPAID";
  if (refUpper.startsWith("PAID.") || refUpper.startsWith("UNPAID.")) return refUpper;
  if (refUpper === "MEMBERSHIP") return "PAID.MEMBERSHIP";

  // fallback – keep adminPaid in mind
  return `${adminPaid ? "PAID" : "UNPAID"}.${refUpper}`;
}

/**
 * Build one row per slot in the shape:
 * User Name | Phone | Date | Payment | Amount | Court ID | Start | End | Type | Who | Actions | Booking ID
 * - amount is per-slot (like your UI table)
 * - Booking ID column will store orderId (unique per booking)
 */
export function bookingToRows(input: {
  userName: string;
  phone?: string;
  date: string; // "YYYY-MM-DD"
  paymentRef?: string;
  adminPaid?: boolean;
  totalAmount?: number | null; // total for the whole booking
  slots: { courtId: number; start: string; end: string }[];
  bookingType: "Normal" | "Special" | "Individual";
  who: "member" | "user" | "guest";
  bookingId?: string; // ⬅️ We pass orderId here
}) {
  const perSlot =
    typeof input.totalAmount === "number" && input.slots.length > 0
      ? Math.round(input.totalAmount / input.slots.length)
      : input.totalAmount ?? "";

  const pay = formatPayment(input.paymentRef, input.adminPaid);

  const rows: (string | number)[][] = input.slots.map((s) => [
    input.userName || "—",                // User Name
    input.phone || "",                    // Phone
    input.date,                           // Date
    pay,                                  // Payment
    perSlot === "" ? "" : perSlot,        // Amount (per-slot)
    s.courtId ?? "",                      // Court ID
    s.start || "",                        // Start
    s.end || "",                          // End
    input.bookingType,                    // Type
    input.who,                            // Who
    "",                                   // Actions (blank)
    input.bookingId || "",                // Booking ID (orderId)
  ]);

  // If somehow no slots were passed, still push a single summary row
  if (!rows.length) {
    rows.push([
      input.userName || "—",
      input.phone || "",
      input.date,
      pay,
      input.totalAmount ?? "",
      "",
      "",
      "",
      input.bookingType,
      input.who,
      "",
      input.bookingId || "",
    ]);
  }

  return rows;
}

/** Append rows under header. Each row must have HEADER.length columns (A..L). */
export async function appendRows(rows: (string | number | null | undefined)[][]) {
  if (!rows?.length) return;

  await ensureMainHeader();

  const sheets = await getSheets();
  const spreadsheetId = SHEET_ID();
  const sheetName = TAB_NAME();

  // Normalize: make sure every row has exactly HEADER.length cells
  const fixed = rows.map((r) => {
    const arr = Array.from(r);
    if (arr.length < HEADER.length) {
      arr.push(...Array(HEADER.length - arr.length).fill(""));
    } else if (arr.length > HEADER.length) {
      arr.length = HEADER.length;
    }
    return arr.map((v) => (v == null ? "" : v));
  });

  const endCol = toA1Col(HEADER.length);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:${endCol}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: fixed },
  });
}

/**
 * Update the Payment cell for a given booking key (orderId) in the main bookings tab.
 * Looks up the row by "Booking ID" column and updates the "Payment" column.
 */
export async function updateBookingPaymentById(
  bookingKey: string,           // we pass orderId here
  paymentRef?: string,
  adminPaid?: boolean
) {
  if (!bookingKey) return;

  await ensureMainHeader();

  const sheets = await getSheets();
  const spreadsheetId = SHEET_ID();
  const sheetName = TAB_NAME();

  // Locate columns
  const bookingIdColIndex = HEADER.indexOf("Booking ID") + 1; // 1-based
  const paymentColIndex = HEADER.indexOf("Payment") + 1;      // 1-based

  if (bookingIdColIndex <= 0 || paymentColIndex <= 0) return;

  const bookingIdColLetter = toA1Col(bookingIdColIndex);
  const paymentColLetter = toA1Col(paymentColIndex);

  // Read full Booking ID column
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${bookingIdColLetter}:${bookingIdColLetter}`,
  });

  const values = read.data.values || [];
  let rowIndex = -1;

  // Row 1 is header, so start from 1
  for (let i = 1; i < values.length; i++) {
    const cellVal = (values[i]?.[0] || "").toString().trim();
    if (cellVal === bookingKey) {
      rowIndex = i + 1; // 1-based
      break;
    }
  }

  // If not found, nothing to update
  if (rowIndex === -1) return;

  const pay = formatPayment(paymentRef, adminPaid);
  const range = `${sheetName}!${paymentColLetter}${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[pay]] },
  });
}

/** ──────────────────────────────────────────────────────────────────────
 * Public API — Cancellations (Sheet 2)
 * ──────────────────────────────────────────────────────────────────── */

export type CancelRowIn = {
  ts?: Date;                // when the cancel happened (defaults now)
  action?: "CANCELLED";     // constant
  date: string;             // YYYY-MM-DD
  courtId: number | null;
  start: string;
  end: string;
  userName: string;
  phone?: string;
  who?: "member" | "user" | "guest";
  bookingType?: "Normal" | "Special" | "Individual";
  paymentRef?: string;
  amount?: number | null;   // per-slot amount if available
  currency?: string;        // e.g. INR
  refundStatus?: "NO_REFUND_REQUIRED" | "SUCCESS" | "FAILED" | "PENDING" | string;
  note?: string;            // any extra context
  orderId?: string;         // optional: for audits
};

/** Map a cancellation record into a single row for the cancellation sheet. */
export function cancellationToRow(r: CancelRowIn): (string | number)[] {
  const when = r.ts ?? new Date();
  return [
    when.toISOString(),                 // Timestamp
    r.action || "CANCELLED",            // Action
    r.date || "—",                      // Date
    r.courtId ?? "",                    // Court ID
    r.start || "—",                     // Start
    r.end || "—",                       // End
    r.userName || "—",                  // User Name
    r.phone || "",                      // Phone (keep empty if unknown)
    r.who || "user",                    // Who
    r.bookingType || "Normal",          // Booking Type
    r.paymentRef || "—",                // Payment
    r.amount == null ? "" : r.amount,   // Amount (per-slot if known)
    r.currency || "INR",                // Currency
    r.refundStatus || "—",              // Refund Status
    r.note || "",                       // Notes
    r.orderId || "",                    // Order Id (audit aid)
  ];
}

/**
 * Append cancellation rows to the cancellations tab.
 *
 * Behavior:
 * - If GOOGLE_SHEETS_CANCEL_TAB is provided → ensure header on that tab name and append.
 * - Else → ensure there is a second tab. If missing, create it at index 1, write header, then append.
 */
export async function appendCancellations(rows: CancelRowIn[]) {
  if (!rows?.length) return;

  const sheets = await getSheets();
  const spreadsheetId = SHEET_ID();
  const cancelTabName = CANCEL_TAB_NAME();

  const values = rows.map(cancellationToRow);

  // Named cancel tab path
  if (cancelTabName) {
    await ensureHeaderForTabName(cancelTabName, CANCEL_HEADER);

    const endCol = toA1Col(CANCEL_HEADER.length);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${cancelTabName}!A:${endCol}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
    return;
  }

  // Fallback: use or create the second sheet by index
  const sheetId = await getOrCreateSecondTabSheetId();

  // Ensure header via sheetId (idempotent)
  await ensureHeaderForSheetId(sheetId, CANCEL_HEADER);

  // Append rows via AppendCellsRequest to the target sheetId
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          appendCells: {
            sheetId,
            fields: "*",
            rows: values.map((row) => ({
              values: row.map((v) =>
                typeof v === "number"
                  ? { userEnteredValue: { numberValue: v } }
                  : { userEnteredValue: { stringValue: String(v) } }
              ),
            })),
          },
        },
      ],
    },
  });
}
