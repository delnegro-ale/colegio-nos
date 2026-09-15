const LEADS_SHEET_NAME = 'Leads D1';
const HEADERS = [
  'lead_id', 'status', 'nome', 'email', 'telefone', 'unidade', 'serie',
  'primeiro_registro', 'ultima_atualizacao', 'concluido_em',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'pagina', 'referencia', 'sincronizado_em'
];

function doGet() {
  return jsonResponse_({ ok: true, service: 'colegio-nos-sheets' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty('SYNC_SECRET');
    const spreadsheetId = properties.getProperty('SPREADSHEET_ID');

    if (!expectedSecret || !spreadsheetId) {
      return jsonResponse_({ ok: false, error: 'script_not_configured' });
    }
    if (!data.syncSecret || data.syncSecret !== expectedSecret) {
      return jsonResponse_({ ok: false, error: 'unauthorized' });
    }
    if (!data.id || !/^[A-Za-z0-9_-]{8,80}$/.test(String(data.id))) {
      return jsonResponse_({ ok: false, error: 'invalid_lead_id' });
    }

    lock.waitLock(10000);
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ensureSheet_(spreadsheet);
    const rowNumber = findLeadRow_(sheet, String(data.id));
    const existing = rowNumber ? sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0] : null;
    const now = new Date().toISOString();
    const complete = data.status === 'completo' || (existing && existing[1] === 'completo');

    const row = [
      String(data.id),
      complete ? 'completo' : 'parcial',
      text_(data.nome),
      text_(data.email),
      text_(data.tel),
      text_(data.unidade),
      text_(data.serie),
      existing && existing[7] ? existing[7] : text_(data.primeiro_registro) || now,
      text_(data.ultima_atualizacao) || now,
      existing && existing[9] ? existing[9] : text_(data.concluido_em),
      existing && existing[10] ? existing[10] : text_(data.utm_source),
      existing && existing[11] ? existing[11] : text_(data.utm_medium),
      existing && existing[12] ? existing[12] : text_(data.utm_campaign),
      existing && existing[13] ? existing[13] : text_(data.utm_content),
      existing && existing[14] ? existing[14] : text_(data.utm_term),
      existing && existing[15] ? existing[15] : text_(data.gclid),
      existing && existing[16] ? existing[16] : text_(data.fbclid),
      text_(data.pagina),
      existing && existing[18] ? existing[18] : text_(data.referencia),
      now
    ];

    const targetRow = rowNumber || sheet.getLastRow() + 1;
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    return jsonResponse_({ ok: true, id: data.id, row: targetRow, status: row[1] });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error && error.message || error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function ensureSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(LEADS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(LEADS_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#4C4C4C')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (currentHeaders.join('|') !== HEADERS.join('|')) {
      throw new Error('A aba "' + LEADS_SHEET_NAME + '" já existe com colunas incompatíveis.');
    }
  }
  return sheet;
}

function findLeadRow_(sheet, leadId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const match = sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(leadId)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : null;
}

function text_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
