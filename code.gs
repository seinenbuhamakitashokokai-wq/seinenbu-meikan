/**
 * フォームの送信時に発火する関数
 * ※事前にGoogle Apps Scriptのエディタから「トリガー」として
 * 　[イベントのソース: スプレッドシートから][イベントの種類: フォーム送信時]
 * 　でこの関数を登録してください。
 */
function onFormSubmitTrigger(e) {
  triggerGitHubAction();
}

/**
 * GitHub ActionsのAPIを叩いてリポジトリディスパッチを発火させる
 */
function triggerGitHubAction() {
  // ======== 設定項目 ========
  // GitHubのパーソナルアクセストークン
  // （Fine-grained tokenで、このリポジトリのみ「Contents: Read and write」を付与して発行）
  // コードには書かず、Apps Scriptの「プロジェクトの設定 > スクリプト プロパティ」に
  // プロパティ名 GITHUB_PAT で登録してください。
  var personalAccessToken = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  if (!personalAccessToken) {
    Logger.log("Error: スクリプト プロパティ GITHUB_PAT が設定されていません。");
    return;
  }
  // オーナー名 (GitHubのユーザー名 または Organization名)
  var owner = 'seinenbuhamakitashokokai-wq';
  // リポジトリ名
  var repo = 'seinenbu-meikan';
  // ==========================

  var url = 'https://api.github.com/repos/' + owner + '/' + repo + '/dispatches';
  
  // deploy.yml の repository_dispatch: types: [update-sheet] に対応
  var payload = {
    "event_type": "update-sheet"
  };
  
  var options = {
    'method': 'post',
    'headers': {
      'Authorization': 'token ' + personalAccessToken,
      'Accept': 'application/vnd.github.v3+json'
    },
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    // ステータスコード204が返ってくれば成功
    if(response.getResponseCode() === 204) {
      Logger.log("Successfully triggered GitHub Actions.");
    } else {
      Logger.log("Failed to trigger GitHub Actions. Response: " + response.getContentText());
    }
  } catch (err) {
    Logger.log("Error: " + err.message);
  }
}
