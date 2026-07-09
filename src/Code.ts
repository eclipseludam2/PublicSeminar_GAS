/**
 * Demo-only ticket application workflow for Google Apps Script.
 *
 * This file intentionally requires ENVIRONMENT=DEMO before it mutates sheets
 * or sends email. Keep real IDs, member rosters, form responses, and serial
 * codes outside Git; configure them with Script Properties in the demo GAS
 * project.
 */

const DEMO_ENVIRONMENT = "DEMO";
const DEMO_PREFIX = "[DEMO]";

const DEMO_SHEETS = {
  members: "DemoMembers",
  validatedApplications: "DemoValidatedApplications",
  applicationExceptions: "DemoApplicationExceptions",
  lotteryDraft: "DemoLotteryDraft",
  lotteryFinal: "DemoLotteryFinal",
  serialCodes: "DemoSerialCodes",
  serialAssignments: "DemoSerialAssignments",
  mailQueue: "DemoMailQueue",
} as const;

const DEMO_HEADERS = {
  members: ["studentId", "email", "memberName", "status", "note"],
  validatedApplications: ["applicationId", "submittedAt", "email", "studentId", "applicantName", "ticketCount", "memberName", "sourceRow"],
  applicationExceptions: ["applicationId", "submittedAt", "email", "applicantName", "ticketCount", "sourceRow", "reason", "detail"],
  lotteryDraft: ["applicationId", "email", "studentId", "applicantName", "requestedTicketCount", "draftStatus", "draftTicketCount", "note"],
  lotteryFinal: ["applicationId", "email", "studentId", "applicantName", "finalStatus", "finalTicketCount", "adminNote"],
  serialCodes: ["no", "serialCode", "used", "applicationNumber", "applicationUserId", "applicantName", "salesReceptionName", "winLoss", "assignedApplicationId", "assignedAt"],
  serialAssignments: ["assignmentId", "applicationId", "email", "applicantName", "serialCode", "assignedAt"],
  mailQueue: ["mailId", "applicationId", "email", "subject", "body", "status", "createdAt", "sentAt", "error"],
} as const;

type DemoConfig = {
  environment: string;
  formResponsesSpreadsheetId: string;
  memberRosterSpreadsheetId: string;
  livePocketEventUrl: string;
  mailSenderName: string;
  formResponseSheetName: string;
  formEmailHeader: string;
  formApplicantNameHeader: string;
  formTicketCountHeader: string;
  studentEmailPattern: string;
  memberSheetName: string;
  memberStudentIdHeader: string;
  memberEmailHeader: string;
  memberNameHeader: string;
  memberStatusHeader: string;
  memberActiveStatus: string;
  maxTicketsPerApplication: number;
  mailDryRun: boolean;
  mailMaxSendPerRun: number;
  serialImportSheetName: string;
  originalRosterSpreadsheetId: string;
  originalRosterSheetName: string;
  originalRosterStudentIdHeader: string;
  originalRosterEmailHeader: string;
  originalRosterMemberNameHeader: string;
  originalRosterStatusHeader: string;
  originalRosterActiveStatus: string;
  originalRosterFilterHeader: string;
  originalRosterFilterValue: string;
};

type RowMap = Record<string, string>;

type FinalWinner = {
  applicationId: string;
  email: string;
  studentId: string;
  applicantName: string;
  finalStatus: string;
  finalTicketCount: number;
  adminNote: string;
};

function healthCheck(): string {
  return "ticket-application-gas:demo-ready";
}

function setupDemoSheets(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);

  const memberSpreadsheet = SpreadsheetApp.openById(config.memberRosterSpreadsheetId);
  ensureSheetWithHeader(memberSpreadsheet, config.memberSheetName, DEMO_HEADERS.members);
  ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.validatedApplications, DEMO_HEADERS.validatedApplications);
  ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.applicationExceptions, DEMO_HEADERS.applicationExceptions);
  ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.lotteryDraft, DEMO_HEADERS.lotteryDraft);
  ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.lotteryFinal, DEMO_HEADERS.lotteryFinal);
  ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.serialCodes, DEMO_HEADERS.serialCodes);
  ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.serialAssignments, DEMO_HEADERS.serialAssignments);
  ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.mailQueue, DEMO_HEADERS.mailQueue);

  logDemo("Demo sheets initialized");
}

function generateDemoMemberRosterFromOriginal(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  if (!config.originalRosterSpreadsheetId) {
    throw new Error("Missing Script Property: DEMO_ORIGINAL_ROSTER_SPREADSHEET_ID");
  }

  const sourceSpreadsheet = SpreadsheetApp.openById(config.originalRosterSpreadsheetId);
  const sourceSheet = getRequiredSheet(sourceSpreadsheet, config.originalRosterSheetName);
  const targetSpreadsheet = SpreadsheetApp.openById(config.memberRosterSpreadsheetId);
  const generatedRows: string[][] = [];
  const seenStudentIds: Record<string, boolean> = {};

  readSheetAsMaps(sourceSheet).forEach((row, index) => {
    if (!passesRosterFilter(row, config)) {
      return;
    }
    const studentId = normalizeText(row[config.originalRosterStudentIdHeader]);
    if (!studentId) {
      return;
    }
    if (seenStudentIds[studentId]) {
      throw new Error(`Duplicate studentId in original roster at row ${index + 2}`);
    }
    seenStudentIds[studentId] = true;

    const status = normalizeStatus(row[config.originalRosterStatusHeader] || config.memberActiveStatus);
    if (config.originalRosterActiveStatus && status !== normalizeStatus(config.originalRosterActiveStatus)) {
      return;
    }

    generatedRows.push([
      studentId,
      normalizeEmail(row[config.originalRosterEmailHeader]),
      normalizeText(row[config.originalRosterMemberNameHeader]),
      config.memberActiveStatus,
      `${DEMO_PREFIX} generated from original roster`,
    ]);
  });

  replaceSheetRows(targetSpreadsheet, config.memberSheetName, DEMO_HEADERS.members, generatedRows);
  logDemo(`Generated demo member roster: ${generatedRows.length}`);
}

function importDemoSerialCodesFromSheet(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const importSheet = getRequiredSheet(spreadsheet, config.serialImportSheetName);
  const importedRows = readSheetAsMaps(importSheet);
  const seenSerialCodes: Record<string, boolean> = {};
  const serialRows: string[][] = [];

  importedRows.forEach((row, index) => {
    const serialCode = normalizeText(row["シリアルコード"] || row.serialCode);
    if (!serialCode) {
      return;
    }
    if (seenSerialCodes[serialCode]) {
      throw new Error(`Duplicate demo serial code at import row ${index + 2}`);
    }
    seenSerialCodes[serialCode] = true;
    serialRows.push([
      normalizeText(row.No || row.no || String(index + 1)),
      serialCode,
      normalizeText(row["使用済み"] || row.used),
      normalizeText(row["申込番号"] || row.applicationNumber),
      normalizeText(row["申込ユーザーID"] || row.applicationUserId),
      normalizeText(row["申込者名"] || row.applicantName),
      normalizeText(row["販売受付名"] || row.salesReceptionName),
      normalizeText(row["当選・落選"] || row.winLoss),
      "",
      "",
    ]);
  });

  replaceSheetRows(spreadsheet, DEMO_SHEETS.serialCodes, DEMO_HEADERS.serialCodes, serialRows);
  logDemo(`Demo serial codes imported: ${serialRows.length}`);
}

function validateDemoApplications(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const responseSpreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const responseSheet = getRequiredSheet(responseSpreadsheet, config.formResponseSheetName);
  const memberIndex = loadDemoMemberIndex(config);
  const validRows: string[][] = [];
  const exceptionRows: string[][] = [];
  const acceptedStudentIds: Record<string, boolean> = {};

  readSheetAsMaps(responseSheet).forEach((row, index) => {
    const sourceRow = index + 2;
    const submittedAt = pickFirst(row, ["タイムスタンプ", "Timestamp", "submittedAt"]);
    const email = normalizeEmail(row[config.formEmailHeader]);
    const applicantName = normalizeText(row[config.formApplicantNameHeader]);
    const ticketCountText = normalizeText(row[config.formTicketCountHeader]);
    const ticketCount = parsePositiveInteger(ticketCountText);
    const applicationId = buildApplicationId(sourceRow, email, submittedAt);
    const studentId = extractStudentId(email, config);

    if (!email) {
      exceptionRows.push(buildExceptionRow(applicationId, submittedAt, email, applicantName, ticketCountText, sourceRow, "EMAIL_MISSING", "メールアドレスが空です"));
      return;
    }
    if (!studentId) {
      exceptionRows.push(buildExceptionRow(applicationId, submittedAt, email, applicantName, ticketCountText, sourceRow, "STUDENT_ID_NOT_FOUND", "メールアドレスから7桁の学籍番号を抽出できません"));
      return;
    }
    if (ticketCount === null) {
      exceptionRows.push(buildExceptionRow(applicationId, submittedAt, email, applicantName, ticketCountText, sourceRow, "INVALID_TICKET_COUNT", `${config.formTicketCountHeader}が正の整数ではありません`));
      return;
    }
    if (ticketCount > config.maxTicketsPerApplication) {
      exceptionRows.push(buildExceptionRow(applicationId, submittedAt, email, applicantName, ticketCountText, sourceRow, "TICKET_COUNT_TOO_LARGE", `${config.formTicketCountHeader}が上限${config.maxTicketsPerApplication}枚を超えています`));
      return;
    }

    const member = memberIndex[studentId];
    if (!member) {
      exceptionRows.push(buildExceptionRow(applicationId, submittedAt, email, applicantName, String(ticketCount), sourceRow, "MEMBER_NOT_FOUND", "デモ会員名簿に学籍番号がありません"));
      return;
    }
    if (member.status !== config.memberActiveStatus) {
      exceptionRows.push(buildExceptionRow(applicationId, submittedAt, email, applicantName, String(ticketCount), sourceRow, "MEMBER_NOT_ACTIVE", `会員状態が${config.memberActiveStatus}ではありません`));
      return;
    }
    if (acceptedStudentIds[studentId]) {
      exceptionRows.push(buildExceptionRow(applicationId, submittedAt, email, applicantName, String(ticketCount), sourceRow, "DUPLICATE_APPLICATION", "同じ学籍番号の有効申込が既にあります"));
      return;
    }

    acceptedStudentIds[studentId] = true;
    validRows.push([applicationId, submittedAt, email, studentId, applicantName, String(ticketCount), member.memberName, String(sourceRow)]);
  });

  replaceSheetRows(responseSpreadsheet, DEMO_SHEETS.validatedApplications, DEMO_HEADERS.validatedApplications, validRows);
  replaceSheetRows(responseSpreadsheet, DEMO_SHEETS.applicationExceptions, DEMO_HEADERS.applicationExceptions, exceptionRows);
  logDemo(`Validated applications: ${validRows.length}, exceptions: ${exceptionRows.length}`);
}

function createDemoLotteryDraft(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const applications = readSheetAsMaps(getRequiredSheet(spreadsheet, DEMO_SHEETS.validatedApplications));
  const draftRows = applications.map((row) => {
    const requestedTicketCount = parsePositiveInteger(row.ticketCount) || 0;
    return [row.applicationId, row.email, row.studentId, row.applicantName, String(requestedTicketCount), "WIN", String(requestedTicketCount), "auto draft; edit before finalizing"];
  });

  replaceSheetRows(spreadsheet, DEMO_SHEETS.lotteryDraft, DEMO_HEADERS.lotteryDraft, draftRows);
  logDemo(`Lottery draft created: ${draftRows.length}`);
}

function finalizeDemoLottery(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const draftRows = readSheetAsMaps(getRequiredSheet(spreadsheet, DEMO_SHEETS.lotteryDraft));
  const finalRows = draftRows.map((row) => [
    row.applicationId,
    row.email,
    row.studentId,
    row.applicantName,
    normalizeStatus(row.draftStatus),
    String(parsePositiveInteger(row.draftTicketCount) || 0),
    row.note || "",
  ]);

  replaceSheetRows(spreadsheet, DEMO_SHEETS.lotteryFinal, DEMO_HEADERS.lotteryFinal, finalRows);
  logDemo(`Lottery finalized: ${finalRows.length}`);
}

function allocateDemoSerialCodes(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const finalWinners = loadRequiredFinalWinners(spreadsheet);
  const serialSheet = getRequiredSheet(spreadsheet, DEMO_SHEETS.serialCodes);
  const assignmentsSheet = ensureSheetWithHeader(spreadsheet, DEMO_SHEETS.serialAssignments, DEMO_HEADERS.serialAssignments);
  const existingAssignmentsByApplication = groupAssignmentsByApplication(spreadsheet);
  const availableSerials = readSheetAsMaps(serialSheet)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter((item) => normalizeText(item.row.serialCode) && !normalizeText(item.row.assignedApplicationId));
  const additionalRequiredCount = finalWinners.reduce((sum, winner) => {
    const existingCount = (existingAssignmentsByApplication[winner.applicationId] || []).length;
    if (existingCount > winner.finalTicketCount) {
      throw new Error(`Too many demo serial assignments for applicationId=${winner.applicationId}. required=${winner.finalTicketCount}, existing=${existingCount}`);
    }
    return sum + (winner.finalTicketCount - existingCount);
  }, 0);

  if (availableSerials.length < additionalRequiredCount) {
    throw new Error(`Not enough demo serial codes. required=${additionalRequiredCount}, available=${availableSerials.length}`);
  }

  const newAssignments: string[][] = [];
  const assignedAt = new Date().toISOString();
  let serialIndex = 0;

  finalWinners.forEach((winner) => {
    const existingCount = (existingAssignmentsByApplication[winner.applicationId] || []).length;
    const missingCount = winner.finalTicketCount - existingCount;
    for (let i = 0; i < missingCount; i += 1) {
      const serial = availableSerials[serialIndex];
      serialIndex += 1;
      const serialCode = normalizeText(serial.row.serialCode);
      newAssignments.push([`${winner.applicationId}-${existingCount + i + 1}`, winner.applicationId, winner.email, winner.applicantName, serialCode, assignedAt]);
      serialSheet.getRange(serial.rowNumber, 9, 1, 2).setValues([[winner.applicationId, assignedAt]]);
    }
  });

  appendSheetRows(assignmentsSheet, DEMO_HEADERS.serialAssignments, newAssignments);
  logDemo(`Serial codes assigned: ${newAssignments.length}`);
}

function buildDemoMailQueue(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const assignmentsByApplication = groupAssignmentsByApplication(spreadsheet);
  const finalWinners = loadRequiredFinalWinners(spreadsheet);
  const createdAt = new Date().toISOString();
  const mailRows: string[][] = [];

  finalWinners.forEach((winner) => {
    const serialCodes = assignmentsByApplication[winner.applicationId] || [];
    if (serialCodes.length !== winner.finalTicketCount) {
      throw new Error(`Serial assignment count mismatch for applicationId=${winner.applicationId}. required=${winner.finalTicketCount}, assigned=${serialCodes.length}`);
    }
    mailRows.push([
      `MAIL-${winner.applicationId}`,
      winner.applicationId,
      winner.email,
      `${DEMO_PREFIX} チケット申込デモ 当選シリアルコードのお知らせ`,
      buildDemoMailBody(winner, serialCodes, config.livePocketEventUrl),
      "READY",
      createdAt,
      "",
      "",
    ]);
  });

  replaceSheetRows(spreadsheet, DEMO_SHEETS.mailQueue, DEMO_HEADERS.mailQueue, mailRows);
  logDemo(`Mail queue built: ${mailRows.length}`);
}

function sendDemoMails(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const mailSheet = getRequiredSheet(spreadsheet, DEMO_SHEETS.mailQueue);
  const readyItems = readSheetAsMaps(mailSheet)
    .map((row, index) => ({ row, sheetRow: index + 2 }))
    .filter((item) => normalizeStatus(item.row.status) === "READY");

  if (config.mailDryRun) {
    readyItems.forEach((item) => {
      mailSheet.getRange(item.sheetRow, 6, 1, 4).setValues([["READY", item.row.createdAt, "", "Dry run; Gmail was not sent."]]);
    });
    logDemo(`Mail dry run completed: ${readyItems.length}`);
    return;
  }

  if (readyItems.length > config.mailMaxSendPerRun) {
    throw new Error(`Too many READY demo mails. ready=${readyItems.length}, max=${config.mailMaxSendPerRun}`);
  }

  readyItems.forEach((item) => {
    try {
      GmailApp.sendEmail(item.row.email, item.row.subject, item.row.body, { name: config.mailSenderName });
      mailSheet.getRange(item.sheetRow, 6, 1, 4).setValues([["SENT", item.row.createdAt, new Date().toISOString(), ""]]);
    } catch (error) {
      mailSheet.getRange(item.sheetRow, 6, 1, 4).setValues([["ERROR", item.row.createdAt, "", String(error)]]);
    }
  });
}

function runDemoValidationAndDraft(): void {
  validateDemoApplications();
  createDemoLotteryDraft();
}

function runDemoAfterFinalizedLottery(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  loadRequiredFinalWinners(spreadsheet);
  allocateDemoSerialCodes();
  buildDemoMailQueue();
}

function runDemoFullWorkflow(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  setupDemoSheets();
  resetDemoWorkflowOutputs(config);
  if (config.originalRosterSpreadsheetId) {
    generateDemoMemberRosterFromOriginal();
  }
  importDemoSerialCodesFromSheet();
  runDemoValidationAndDraft();
  finalizeDemoLottery();
  runDemoAfterFinalizedLottery();
  sendDemoMails();
}

function resetDemo(): void {
  const config = getDemoConfig();
  assertDemoEnvironment(config);
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  const memberSpreadsheet = SpreadsheetApp.openById(config.memberRosterSpreadsheetId);

  replaceSheetRows(memberSpreadsheet, config.memberSheetName, DEMO_HEADERS.members, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.validatedApplications, DEMO_HEADERS.validatedApplications, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.applicationExceptions, DEMO_HEADERS.applicationExceptions, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.lotteryDraft, DEMO_HEADERS.lotteryDraft, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.lotteryFinal, DEMO_HEADERS.lotteryFinal, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.serialCodes, DEMO_HEADERS.serialCodes, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.serialAssignments, DEMO_HEADERS.serialAssignments, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.mailQueue, DEMO_HEADERS.mailQueue, []);

  logDemo("Demo sheets have been reset to initial empty states.");
}

function resetDemoWorkflowOutputs(config: DemoConfig): void {
  const spreadsheet = SpreadsheetApp.openById(config.formResponsesSpreadsheetId);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.validatedApplications, DEMO_HEADERS.validatedApplications, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.applicationExceptions, DEMO_HEADERS.applicationExceptions, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.lotteryDraft, DEMO_HEADERS.lotteryDraft, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.lotteryFinal, DEMO_HEADERS.lotteryFinal, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.serialCodes, DEMO_HEADERS.serialCodes, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.serialAssignments, DEMO_HEADERS.serialAssignments, []);
  replaceSheetRows(spreadsheet, DEMO_SHEETS.mailQueue, DEMO_HEADERS.mailQueue, []);
  logDemo("Demo workflow output sheets have been reset.");
}

function getDemoConfig(): DemoConfig {
  const props = PropertiesService.getScriptProperties();
  const maxTicketsPerApplication = parseRequiredPositiveIntegerProperty(props, "DEMO_MAX_TICKETS_PER_APPLICATION", "20");
  const mailMaxSendPerRun = parseRequiredPositiveIntegerProperty(props, "DEMO_MAIL_MAX_SEND_PER_RUN", "20");
  return {
    environment: getRequiredProperty(props, "ENVIRONMENT"),
    formResponsesSpreadsheetId: getRequiredProperty(props, "DEMO_FORM_RESPONSES_SPREADSHEET_ID"),
    memberRosterSpreadsheetId: props.getProperty("DEMO_MEMBER_ROSTER_SPREADSHEET_ID") || getRequiredProperty(props, "DEMO_FORM_RESPONSES_SPREADSHEET_ID"),
    livePocketEventUrl: getRequiredProperty(props, "DEMO_LIVEPOCKET_EVENT_URL"),
    mailSenderName: props.getProperty("DEMO_MAIL_SENDER_NAME") || "Public Seminar Demo",
    formResponseSheetName: props.getProperty("DEMO_FORM_RESPONSE_SHEET_NAME") || "FormResponses",
    formEmailHeader: props.getProperty("DEMO_FORM_EMAIL_HEADER") || "メールアドレス",
    formApplicantNameHeader: props.getProperty("DEMO_FORM_APPLICANT_NAME_HEADER") || "申請者名",
    formTicketCountHeader: props.getProperty("DEMO_FORM_TICKET_COUNT_HEADER") || "チケット申し込み枚数",
    studentEmailPattern: props.getProperty("DEMO_STUDENT_EMAIL_PATTERN") || "^[a-z](\\d{7})@",
    memberSheetName: props.getProperty("DEMO_MEMBER_SHEET_NAME") || DEMO_SHEETS.members,
    memberStudentIdHeader: props.getProperty("DEMO_MEMBER_STUDENT_ID_HEADER") || "studentId",
    memberEmailHeader: props.getProperty("DEMO_MEMBER_EMAIL_HEADER") || "email",
    memberNameHeader: props.getProperty("DEMO_MEMBER_NAME_HEADER") || "memberName",
    memberStatusHeader: props.getProperty("DEMO_MEMBER_STATUS_HEADER") || "status",
    memberActiveStatus: props.getProperty("DEMO_MEMBER_ACTIVE_STATUS") || "ACTIVE",
    maxTicketsPerApplication,
    mailDryRun: parseBooleanProperty(props, "DEMO_MAIL_DRY_RUN", true),
    mailMaxSendPerRun,
    serialImportSheetName: props.getProperty("DEMO_SERIAL_IMPORT_SHEET_NAME") || "SerialImport",
    originalRosterSpreadsheetId: props.getProperty("DEMO_ORIGINAL_ROSTER_SPREADSHEET_ID") || "",
    originalRosterSheetName: props.getProperty("DEMO_ORIGINAL_ROSTER_SHEET_NAME") || "OriginalRoster",
    originalRosterStudentIdHeader: props.getProperty("DEMO_ORIGINAL_ROSTER_STUDENT_ID_HEADER") || "studentId",
    originalRosterEmailHeader: props.getProperty("DEMO_ORIGINAL_ROSTER_EMAIL_HEADER") || "email",
    originalRosterMemberNameHeader: props.getProperty("DEMO_ORIGINAL_ROSTER_MEMBER_NAME_HEADER") || "memberName",
    originalRosterStatusHeader: props.getProperty("DEMO_ORIGINAL_ROSTER_STATUS_HEADER") || "status",
    originalRosterActiveStatus: props.getProperty("DEMO_ORIGINAL_ROSTER_ACTIVE_STATUS") || "",
    originalRosterFilterHeader: props.getProperty("DEMO_ORIGINAL_ROSTER_FILTER_HEADER") || "",
    originalRosterFilterValue: props.getProperty("DEMO_ORIGINAL_ROSTER_FILTER_VALUE") || "",
  };
}

function assertDemoEnvironment(config: DemoConfig): void {
  if (config.environment !== DEMO_ENVIRONMENT) {
    throw new Error("Demo workflow is blocked because ENVIRONMENT is not DEMO.");
  }
  if (!config.livePocketEventUrl.includes("http")) {
    throw new Error("DEMO_LIVEPOCKET_EVENT_URL must be a demo LivePocket URL.");
  }
}

function getRequiredProperty(props: GoogleAppsScript.Properties.Properties, key: string): string {
  const value = props.getProperty(key);
  if (!value) {
    throw new Error(`Missing Script Property: ${key}`);
  }
  return value;
}

function parseRequiredPositiveIntegerProperty(props: GoogleAppsScript.Properties.Properties, key: string, defaultValue: string): number {
  const parsed = parsePositiveInteger(props.getProperty(key) || defaultValue);
  if (parsed === null) {
    throw new Error(`Script Property ${key} must be a positive integer.`);
  }
  return parsed;
}

function parseBooleanProperty(props: GoogleAppsScript.Properties.Properties, key: string, defaultValue: boolean): boolean {
  const rawValue = props.getProperty(key);
  if (rawValue === null) {
    return defaultValue;
  }
  const value = normalizeStatus(rawValue);
  if (value === "TRUE") {
    return true;
  }
  if (value === "FALSE") {
    return false;
  }
  throw new Error(`Script Property ${key} must be true or false.`);
}

function ensureSheetWithHeader(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string, headers: readonly string[]): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0].map((value) => normalizeText(value));
  headers.forEach((header, index) => {
    if (!existingHeaders[index]) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
  sheet.setFrozenRows(1);
  return sheet;
}

function getRequiredSheet(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Missing sheet: ${sheetName}`);
  }
  return sheet;
}

function readSheetAsMaps(sheet: GoogleAppsScript.Spreadsheet.Sheet): RowMap[] {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    return [];
  }
  const headers = values[0].map((header) => normalizeText(header));
  return values.slice(1)
    .filter((row) => row.some((cell) => normalizeText(cell)))
    .map((row) => {
      const map: RowMap = {};
      headers.forEach((header, index) => {
        if (header) {
          map[header] = normalizeText(row[index]);
        }
      });
      return map;
    });
}

function replaceSheetRows(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string, headers: readonly string[], rows: string[][]): void {
  const sheet = ensureSheetWithHeader(spreadsheet, sheetName, headers);
  const maxRows = Math.max(sheet.getLastRow() - 1, 0);
  if (maxRows > 0) {
    sheet.getRange(2, 1, maxRows, Math.max(sheet.getLastColumn(), headers.length)).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function appendSheetRows(sheet: GoogleAppsScript.Spreadsheet.Sheet, headers: readonly string[], rows: string[][]): void {
  if (rows.length === 0) {
    return;
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function loadDemoMemberIndex(config: DemoConfig): Record<string, { email: string; memberName: string; status: string }> {
  const spreadsheet = SpreadsheetApp.openById(config.memberRosterSpreadsheetId);
  const sheet = getRequiredSheet(spreadsheet, config.memberSheetName);
  const index: Record<string, { email: string; memberName: string; status: string }> = {};
  readSheetAsMaps(sheet).forEach((row) => {
    const studentId = normalizeText(row[config.memberStudentIdHeader]);
    if (studentId) {
      index[studentId] = {
        email: normalizeEmail(row[config.memberEmailHeader]),
        memberName: normalizeText(row[config.memberNameHeader]),
        status: normalizeStatus(row[config.memberStatusHeader]),
      };
    }
  });
  return index;
}

function loadFinalWinners(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): FinalWinner[] {
  return readSheetAsMaps(getRequiredSheet(spreadsheet, DEMO_SHEETS.lotteryFinal))
    .filter((row) => isWinningStatus(row.finalStatus))
    .map((row) => ({
      applicationId: row.applicationId,
      email: row.email,
      studentId: row.studentId,
      applicantName: row.applicantName,
      finalStatus: normalizeStatus(row.finalStatus),
      finalTicketCount: parsePositiveInteger(row.finalTicketCount) || 0,
      adminNote: row.adminNote || "",
    }))
    .filter((winner) => winner.finalTicketCount > 0);
}

function loadRequiredFinalWinners(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): FinalWinner[] {
  const finalRows = readSheetAsMaps(getRequiredSheet(spreadsheet, DEMO_SHEETS.lotteryFinal));
  if (finalRows.length === 0) {
    throw new Error("DemoLotteryFinal is empty. Run finalizeDemoLottery after reviewing DemoLotteryDraft.");
  }
  const finalWinners = loadFinalWinners(spreadsheet);
  if (finalWinners.length === 0) {
    throw new Error("DemoLotteryFinal has no winners with positive ticket counts.");
  }
  return finalWinners;
}

function groupAssignmentsByApplication(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  readSheetAsMaps(getRequiredSheet(spreadsheet, DEMO_SHEETS.serialAssignments)).forEach((row) => {
    const applicationId = normalizeText(row.applicationId);
    const serialCode = normalizeText(row.serialCode);
    if (!applicationId || !serialCode) {
      return;
    }
    if (!grouped[applicationId]) {
      grouped[applicationId] = [];
    }
    grouped[applicationId].push(serialCode);
  });
  return grouped;
}

function passesRosterFilter(row: RowMap, config: DemoConfig): boolean {
  if (!config.originalRosterFilterHeader) {
    return true;
  }
  return normalizeText(row[config.originalRosterFilterHeader]) === config.originalRosterFilterValue;
}

function buildExceptionRow(applicationId: string, submittedAt: string, email: string, applicantName: string, ticketCount: string, sourceRow: number, reason: string, detail: string): string[] {
  return [applicationId, submittedAt, email, applicantName, ticketCount, String(sourceRow), reason, detail];
}

function buildApplicationId(sourceRow: number, email: string, submittedAt: string): string {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, `${sourceRow}:${email}:${submittedAt}`)
    .map((byte) => (byte + 256).toString(16).slice(-2))
    .join("")
    .slice(0, 10);
  return `DEMO-${sourceRow}-${digest}`;
}

function buildDemoMailBody(winner: FinalWinner, serialCodes: string[], livePocketEventUrl: string): string {
  return [
    `${winner.applicantName} 様`,
    "",
    "これはデモ環境から送信しているチケット申込検証メールです。",
    "本番イベントの当落通知ではありません。",
    "",
    `LivePocketデモURL: ${livePocketEventUrl}`,
    "",
    "割り当てシリアルコード:",
    ...serialCodes.map((code, index) => `${index + 1}. ${code}`),
    "",
    "上記URLからデモイベントに進み、シリアルコードを入力して申込動作を確認してください。",
    "",
    "[DEMO] Public Seminar GAS",
  ].join("\n");
}

function extractStudentId(email: string, config: DemoConfig): string {
  let regex: RegExp;
  try {
    regex = new RegExp(config.studentEmailPattern);
  } catch (error) {
    throw new Error(`DEMO_STUDENT_EMAIL_PATTERN is invalid: ${String(error)}`);
  }
  const match = email.match(regex);
  return match && match[1] ? match[1] : "";
}

function parsePositiveInteger(value: unknown): number | null {
  const text = normalizeText(value);
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return parsed > 0 ? parsed : null;
}

function normalizeText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function normalizeStatus(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function isWinningStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  return status === "WIN" || status === "当選";
}

function pickFirst(row: RowMap, keys: string[]): string {
  for (const key of keys) {
    if (row[key]) {
      return row[key];
    }
  }
  return "";
}

function logDemo(message: string): void {
  console.log(`${DEMO_PREFIX} ${message}`);
}
