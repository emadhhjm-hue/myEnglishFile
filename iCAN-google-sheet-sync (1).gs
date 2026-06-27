/**********************************************************************
 *  iCAN — Online sync via Google Sheets  (free, no separate database)
 *  ------------------------------------------------------------------
 *  This turns ONE Google Sheet into the live online record for iCAN.
 *  Every quiz/result a student finishes is saved here automatically,
 *  and the teacher dashboard reads everyone's results back from it.
 *
 *  SETUP (about 5 minutes, one time):
 *   1. Go to https://sheets.google.com and create a new blank sheet.
 *      Name it e.g. "iCAN Results".
 *   2. In that sheet: menu  Extensions ▸ Apps Script.
 *   3. Delete whatever code is there, paste ALL of this file, and Save.
 *   4. Click  Deploy ▸ New deployment.
 *        - Click the gear ⚙ next to "Select type" → choose "Web app".
 *        - Description: iCAN
 *        - Execute as:        Me  (your Google account)
 *        - Who has access:    Anyone
 *      Click Deploy. Approve the permissions when Google asks.
 *   5. Copy the "Web app URL" — it ends in  /exec
 *   6. In iCAN: log in as Teacher ▸ "Online sync" ▸ paste the URL ▸
 *      Save & connect. Press Test — it should say "Connected".
 *
 *  That's it. The sheet itself becomes your live spreadsheet record,
 *  and the in-app "Export to Excel" still works as a download.
 *
 *  Note: if you ever change this code, you must Deploy ▸ Manage
 *  deployments ▸ edit ▸ "New version" for changes to take effect.
 **********************************************************************/

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Results');
  if (!sh) {
    sh = ss.insertSheet('Results');
    sh.appendRow(['date','name','class','code','skill','activity','score','max','percent','detail','json']);
  }
  return sh;
}

// Called automatically when a student finishes an activity (iCAN sends data here),
// OR when the teacher publishes content (data._content === true).
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data && data._content === true) {            // teacher content publish
      var cs = contentSheet_();
      cs.getRange(1, 1).setValue(JSON.stringify(data.payload || {}));
      return ContentService.createTextOutput('content-ok');
    }
    var sh = sheet_();
    sh.appendRow([
      data.date || '', data.name || '', data.class || '', data.code || '',
      data.skill || '', data.activity || '',
      (data.score == null ? '' : data.score),
      (data.max == null ? '' : data.max),
      (data.percent == null ? '' : data.percent),
      data.detail || '', JSON.stringify(data)
    ]);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err);
  }
}

// Called when reading records back (action=list) or teacher content (action=content).
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  var cb = e && e.parameter && e.parameter.callback;
  var json;
  if (action === 'content') {
    var v = contentSheet_().getRange(1, 1).getValue();
    json = v ? String(v) : '{}';
  } else {
    var sh = sheet_();
    var rows = sh.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < rows.length; i++) { try { out.push(JSON.parse(rows[i][10])); } catch (err) {} }
    json = JSON.stringify(out);
  }
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function contentSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('Content') || ss.insertSheet('Content');
}
