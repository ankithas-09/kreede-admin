// lib/membershipSheets.ts
import { google } from "googleapis";
import type { sheets_v4, drive_v3 } from "googleapis";
import { UserModel } from "@/models/User";
import { MembershipModel, type MembershipDoc } from "@/models/Membership";

const SHEET_TITLE = "Membership Details"; // preferred tab name

// Slimmed header (no MembershipId, OrderId, UserId, CreatedAt, UpdatedAt)
const HEADER = [
  "Aadhar Number",
  "Member ID",
  "Name",
  "Email",
  "User Phone",
  "Plan",
  "Amount (INR)",
  "Start",
  "End",
  "Games Used",
  "Games Total",
  "Status",
] as const;

type HeaderKey = (typeof HEADER)[number];

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

let sheetsClient: sheets_v4.Sheets | null = null;
let driveClient: drive_v3.Drive | null = null;

function getClients() {
  if (sheetsClient && driveClient) return { sheets: sheetsClient, drive: driveClient };

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error(
      "Google service account env vars missing (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)."
    );
  }

  const auth = new google.auth.JWT({ email, key, scopes: SCOPES });
  sheetsClient = google.sheets({ version: "v4", auth });
  driveClient = google.drive({ version: "v3", auth });
  return { sheets: sheetsClient!, drive: driveClient! };
}

function columnLetter(n: number) {
  // 1 -> A, 26 -> Z, 27 -> AA...
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function columnLetterForHeader(headerName: HeaderKey) {
  const idx = HEADER.indexOf(headerName);
  if (idx === -1) throw new Error(`Header "${headerName}" not found.`);
  return columnLetter(idx + 1); // 1-based for column letters
}

function addMonths(d: Date, months: number) {
  const t = new Date(d);
  t.setMonth(t.getMonth() + months);
  return t;
}

// ✅ New: format date as dd-MM-yyyy in Asia/Kolkata
function fmtDateDMY(d?: Date | string) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
}

function currencyINR(n?: number) {
  if (typeof n !== "number") return "";
  return String(Math.round(n));
}

function rowFrom(
  m: MembershipDoc,
  opts: { aadhar?: string; userPhone?: string }
): Record<HeaderKey, string> {
  const start = m.createdAt;
  const end = addMonths(new Date(m.createdAt), m.durationMonths);
  return {
    "Aadhar Number": opts.aadhar || "",
    "Member ID": m.memberId || "",
    Name: m.userName || "",
    Email: m.userEmail || "",
    "User Phone": opts.userPhone || "",
    Plan: m.planName || m.planId,
    "Amount (INR)": currencyINR(m.amount),
    Start: fmtDateDMY(start), // ⬅️ dd-MM-yyyy IST
    End: fmtDateDMY(end),     // ⬅️ dd-MM-yyyy IST
    "Games Used": String(m.gamesUsed ?? 0),
    "Games Total": String(m.games ?? 0),
    Status: m.status,
  };
}

/**
 * Ensure we can access a spreadsheet + a valid sheet tab, and ensure the header row.
 * - Requires GOOGLE_SHEETS_SPREADSHEET_ID (we don't auto-create spreadsheets).
 * - Prefers the tab named SHEET_TITLE; otherwise uses the first tab.
 */
async function ensureSpreadsheet(): Promise<{ spreadsheetId: string; sheetName: string }> {
  const { sheets } = getClients();
  const envId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();

  if (!envId) {
    throw new Error(
      "GOOGLE_SHEETS_SPREADSHEET_ID is not set. Create the sheet in Google Sheets, share it with the service account, and set the ID in .env."
    );
  }

  // Discover sheet titles
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: envId,
    fields: "sheets(properties(title))",
  });

  const titles = (meta.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter(Boolean) as string[];

  const sheetName = titles.includes(SHEET_TITLE) ? SHEET_TITLE : titles[0] || SHEET_TITLE;

  // Ensure header exists in chosen tab (fall back to A1 if named tab missing)
  const endCol = columnLetter(HEADER.length);
  const tryRanges = [`${sheetName}!A1:${endCol}1`, `A1:${endCol}1`];

  let existing: string[] | undefined;
  for (const r of tryRanges) {
    try {
      const rd = await sheets.spreadsheets.values.get({ spreadsheetId: envId, range: r });
      existing = rd.data.values?.[0] as string[] | undefined;
      if (existing) break;
    } catch {
      // ignore and try next
    }
  }

  const needsHeader =
    !existing ||
    existing.length !== HEADER.length ||
    HEADER.some((h, i) => (existing?.[i] || "").trim() !== h);

  if (needsHeader) {
    let wrote = false;
    for (const r of tryRanges) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: envId,
          range: r,
          valueInputOption: "RAW",
          requestBody: { values: [HEADER as unknown as string[]] },
        });
        wrote = true;
        break;
      } catch {
        // try next
      }
    }
    if (!wrote) {
      throw new Error(
        `Couldn't write header row to spreadsheet ${envId}. Check that the service account has Editor access.`
      );
    }
  }

  return { spreadsheetId: envId, sheetName };
}

/**
 * Find row index by a specific header column and value.
 * Returns the 1-based row number (2 for first data row) or null if not found.
 */
async function findRowIndexByHeaderKey(
  spreadsheetId: string,
  sheetName: string,
  headerName: HeaderKey,
  key: string
): Promise<number | null> {
  const { sheets } = getClients();
  const colLetter = columnLetterForHeader(headerName);
  const ranges = [`${sheetName}!${colLetter}2:${colLetter}`, `${colLetter}2:${colLetter}`];
  for (const range of ranges) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        majorDimension: "COLUMNS",
      });
      const col = res.data.values?.[0] || [];
      const idx = col.findIndex((v) => String(v).trim() === key.trim());
      if (idx !== -1) return idx + 2; // data starts at row 2
      return null;
    } catch {
      // try next
    }
  }
  return null;
}

async function writeRow(
  spreadsheetId: string,
  sheetName: string,
  rowValues: Record<HeaderKey, string>
) {
  const { sheets } = getClients();
  const ordered = HEADER.map((k) => rowValues[k] ?? "");

  const ranges = [`${sheetName}!A:A`, "A:A"];
  let done = false;
  for (const range of ranges) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [ordered] },
      });
      done = true;
      break;
    } catch {
      // try next
    }
  }
  if (!done) {
    throw new Error(`Couldn't append row to spreadsheet ${spreadsheetId}. Check sharing/permissions.`);
  }
}

async function updateRow(
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number,
  rowValues: Record<HeaderKey, string>
) {
  const { sheets } = getClients();
  const ordered = HEADER.map((k) => rowValues[k] ?? "");
  const endCol = columnLetter(HEADER.length);

  const ranges = [
    `${sheetName}!A${rowNumber}:${endCol}${rowNumber}`,
    `A${rowNumber}:${endCol}${rowNumber}`,
  ];

  let done = false;
  for (const range of ranges) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values: [ordered] },
      });
      done = true;
      break;
    } catch {
      // try next
    }
  }
  if (!done) {
    throw new Error(`Couldn't update row ${rowNumber} in spreadsheet ${spreadsheetId}.`);
  }
}

/**
 * Upsert a single membership row.
 * - Uses "Member ID" as the primary key if present; otherwise falls back to "Email".
 * - Requires GOOGLE_SHEETS_SPREADSHEET_ID and that the sheet is shared with the service account (Editor).
 */
export async function upsertMembershipToSheet(membershipId: string): Promise<void> {
  const Membership = await MembershipModel();
  const m = await Membership.findById(membershipId).lean<MembershipDoc | null>();
  if (!m) return;

  const User = await UserModel();
  const u = await User.findById(m.userId).lean<{ phone?: string; aadhar?: string } | null>();

  const { spreadsheetId, sheetName } = await ensureSpreadsheet();
  const row = rowFrom(m, { aadhar: u?.aadhar, userPhone: u?.phone });

  // Prefer Member ID, else Email
  const hasMemberId = Boolean(m.memberId && String(m.memberId).trim());
  const keyHeader: HeaderKey = hasMemberId ? "Member ID" : "Email";
  const keyValue = hasMemberId ? String(m.memberId) : String(m.userEmail);

  const existingRowNumber =
    keyValue ? await findRowIndexByHeaderKey(spreadsheetId, sheetName, keyHeader, keyValue) : null;

  if (existingRowNumber) {
    await updateRow(spreadsheetId, sheetName, existingRowNumber, row);
  } else {
    await writeRow(spreadsheetId, sheetName, row);
  }
}
