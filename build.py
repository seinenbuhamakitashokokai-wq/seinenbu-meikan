import os
import json
import requests
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build
from jinja2 import Environment, FileSystemLoader

# Github Secretsから環境変数として渡される認証情報
CREDENTIALS_JSON = os.environ.get('GOOGLE_CREDENTIALS_JSON')

# ======== 設定項目 ========
SPREADSHEET_ID = '1rsiwmm1CeZYHQmdy2pPqlRaD4s1KAEyCeKka5kMVmbA'
RESPONSE_SHEET_PREFIX = 'フォームの回答'
# ========================

def get_sheet_data():
    creds = None
    if CREDENTIALS_JSON:
        creds_dict = json.loads(CREDENTIALS_JSON)
        creds = service_account.Credentials.from_service_account_info(
            creds_dict, scopes=[
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        )
    else:
        local_json_path = os.path.join(os.path.dirname(__file__), 'seinenbu-meikan-510407-41ea07feabda.json')
        if os.path.exists(local_json_path):
            with open(local_json_path, 'r', encoding='utf-8') as f:
                creds_dict = json.load(f)
            creds = service_account.Credentials.from_service_account_info(
                creds_dict, scopes=[
                    'https://www.googleapis.com/auth/spreadsheets.readonly',
                    'https://www.googleapis.com/auth/drive.readonly'
                ]
            )

    if not creds:
        print("Error: No Credentials found.")
        return []

    service = build('sheets', 'v4', credentials=creds)
    drive_service = build('drive', 'v3', credentials=creds)
    
    # 「フォームの回答 1」(写真あり版) と「フォームの回答 2」(写真なし版) など、回答タブをすべて読む
    sheet_metadata = service.spreadsheets().get(spreadsheetId=SPREADSHEET_ID).execute()
    tab_titles = sorted(s['properties']['title'] for s in sheet_metadata.get('sheets', [])
                        if s['properties']['title'].startswith(RESPONSE_SHEET_PREFIX))

    raw_rows = []
    for title in tab_titles:
        result = service.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=f"'{title}'!A:Z").execute()
        values = result.get('values', [])
        if not values:
            continue
        headers = values[0]
        for row in values[1:]:
            row_data = row + [''] * (len(headers) - len(row))
            raw_rows.append(dict(zip(headers, row_data)))

    members = []
    timestamp_str = datetime.now().strftime('%Y%m%d%H%M')

    for member_raw in raw_rows:
        member = {}
        
        # --- 超堅牢なマッピング（キーワード部分一致で探す） ---
        
        # 1. ニックネーム
        for k, v in member_raw.items():
            if 'ニックネーム' in k:
                member['display_nickname'] = v
                break
        if not member.get('display_nickname'): member['display_nickname'] = '名称未設定'

        # 2. 氏名
        for k, v in member_raw.items():
            if '氏名' in k or 'お名前' in k:
                member['display_name'] = v
                break
        if not member.get('display_name'): member['display_name'] = '氏名未登録'

        # 3. 会社名 / 業種
        for k, v in member_raw.items():
            if '会社名' in k: member['display_company'] = v
            if '業種' in k: member['display_industry'] = v
        
        # 4. 詳細項目
        for k, v in member_raw.items():
            if '出身地' in k: member['birthplace'] = v
            if '入部' in k: member['join_date'] = v
            if '自慢' in k: member['pr_text'] = v
            if '熱中' in k: member['hobby_text'] = v
            if 'グルメ' in k: member['gourmet_text'] = v
            if '相談' in k: member['consult_text'] = v
            if '繋がりたい人' in k: member['want_to_connect_text'] = v

        # 5. 写真 (キーワード「ベストショット」か「写真」が含まれる列)
        img_url = ''
        for k, v in member_raw.items():
            if 'ベストショット' in k or '写真' in k:
                img_url = v
                break
        
        member['photo_url'] = ''
        if img_url:
            file_id = None
            if 'open?id=' in img_url:
                file_id = img_url.split('open?id=')[1].split('&')[0]
            elif '/file/d/' in img_url:
                file_id = img_url.split('/file/d/')[1].split('/')[0]

            if file_id:
                img_dir = 'images'
                if not os.path.exists(img_dir): os.makedirs(img_dir)
                local_path = f"{img_dir}/{file_id}.jpg"
                
                if not os.path.exists(local_path):
                    try:
                        # Drive APIを使用して画像を直接ダウンロード
                        content = drive_service.files().get_media(fileId=file_id).execute()
                        with open(local_path, 'wb') as f:
                            f.write(content)
                    except Exception as e:
                        print(f"Download error for {file_id}: {e}")
                        pass
                
                if os.path.exists(local_path):
                    member['photo_url'] = f"./{local_path}?v={timestamp_str}"
                else:
                    # ダウンロード不可時のフォールバック
                    member['photo_url'] = f"https://drive.google.com/thumbnail?id={file_id}&sz=w800"
            
        members.append(member)
        
    return members

def main():
    members = get_sheet_data()
    env = Environment(loader=FileSystemLoader('.'))
    template = env.get_template('template.html')
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    html_out = template.render(members=members, timestamp=timestamp)
    with open('index.html', 'w', encoding='utf-8-sig') as f:
        f.write(html_out)
    print("Build Success.")

if __name__ == '__main__':
    main()
