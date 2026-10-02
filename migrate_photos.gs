/**
 * 既存写真の移行スクリプト（1回だけ使う）
 *
 * 元の作成者のDriveにある写真を青年部のDriveにコピーし、
 * 「フォームの回答 1」の写真URLをコピー先のURLに書き換えます。
 * 書き換えた内容は「写真移行ログ」シートに記録され、
 * revertPhotoMigration で元のURLに戻せます。
 *
 * 使い方
 * 1. MIGRATION_TARGET_FOLDER_ID にコピー先フォルダのIDを設定
 *    （フォルダURL https://drive.google.com/drive/folders/XXXX の XXXX 部分）
 * 2. previewPhotoMigration を実行し、実行ログで対象を確認（何も変更しません）
 * 3. migratePhotos を実行
 * 4. triggerGitHubAction を実行してサイトを更新
 */

// ======== 設定項目 ========
var MIGRATION_TARGET_FOLDER_ID = 'ここにフォルダIDを貼り付け';
// ==========================

var MIGRATION_SHEET_NAME = 'フォームの回答 1';
var MIGRATION_LOG_SHEET_NAME = '写真移行ログ';

/** 確認のみ（何も変更しません） */
function previewPhotoMigration() {
  runPhotoMigration_(true);
}

/** 写真をコピーしてシートのURLを書き換える */
function migratePhotos() {
  runPhotoMigration_(false);
}

/** 「写真移行ログ」をもとに、写真URLを移行前に戻す */
function revertPhotoMigration() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MIGRATION_SHEET_NAME);
  var log = ss.getSheetByName(MIGRATION_LOG_SHEET_NAME);
  if (!log) throw new Error('「' + MIGRATION_LOG_SHEET_NAME + '」シートがありません');

  // 移行後URL → 移行前URL の対応表（行番号は投稿の追加・削除でずれるのでURLで照合する）
  var newToOld = {};
  var logRows = log.getDataRange().getValues();
  for (var i = 1; i < logRows.length; i++) {
    newToOld[String(logRows[i][4])] = String(logRows[i][3]);
  }

  var values = sheet.getDataRange().getValues();
  var photoCol = findColumns_(values[0]).photo;
  var reverted = 0;
  for (var r = 1; r < values.length; r++) {
    var oldUrl = newToOld[String(values[r][photoCol])];
    if (oldUrl) {
      sheet.getRange(r + 1, photoCol + 1).setValue(oldUrl);
      reverted++;
    }
  }
  Logger.log('【元に戻しました】' + reverted + '件');
}

function runPhotoMigration_(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MIGRATION_SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var cols = findColumns_(values[0]);

  var me = Session.getEffectiveUser().getEmail();
  var folder = dryRun ? null : DriveApp.getFolderById(MIGRATION_TARGET_FOLDER_ID);
  var log = dryRun ? null : getMigrationLogSheet_(ss);
  var counts = { copy: 0, skip: 0, error: 0 };

  for (var r = 1; r < values.length; r++) {
    var url = String(values[r][cols.photo]);
    var fileId = extractFileId_(url);
    if (!fileId) continue;

    var rowNo = r + 1;
    var label = rowNo + '行目 ' + (cols.name >= 0 ? values[r][cols.name] : '');
    try {
      var file = DriveApp.getFileById(fileId);
      var owner = file.getOwner();
      if (owner && owner.getEmail() === me) {
        counts.skip++;
        Logger.log(label + ': すでに青年部のファイルなのでスキップ');
        continue;
      }
      if (dryRun) {
        counts.copy++;
        Logger.log(label + ': コピー予定（' + file.getName() + '）');
        continue;
      }
      var copy = file.makeCopy(file.getName(), folder);
      var newUrl = 'https://drive.google.com/open?id=' + copy.getId();
      sheet.getRange(rowNo, cols.photo + 1).setValue(newUrl);
      log.appendRow([new Date(), rowNo, cols.name >= 0 ? values[r][cols.name] : '', url, newUrl]);
      counts.copy++;
      Logger.log(label + ': コピー完了');
    } catch (err) {
      counts.error++;
      Logger.log(label + ': エラー ' + err.message);
    }
  }

  Logger.log((dryRun ? '【確認のみ・変更なし】コピー予定 ' : '【完了】コピー ') + counts.copy +
             '件 / スキップ ' + counts.skip + '件 / エラー ' + counts.error + '件');
}

function findColumns_(headers) {
  var cols = { photo: -1, name: -1 };
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]);
    if (cols.photo < 0 && h.indexOf('ベストショット') >= 0) cols.photo = i;
    if (cols.name < 0 && (h.indexOf('氏名') >= 0 || h.indexOf('お名前') >= 0)) cols.name = i;
  }
  if (cols.photo < 0) throw new Error('写真（ベストショット）の列が見つかりません');
  return cols;
}

// build.py と同じ2種類のURL形式に対応
function extractFileId_(url) {
  var m = url.match(/open\?id=([A-Za-z0-9_-]+)/) || url.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function getMigrationLogSheet_(ss) {
  var log = ss.getSheetByName(MIGRATION_LOG_SHEET_NAME);
  if (!log) {
    log = ss.insertSheet(MIGRATION_LOG_SHEET_NAME);
    log.appendRow(['実行日時', '行', '氏名', '移行前のURL', '移行後のURL']);
  }
  return log;
}
