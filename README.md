# チケット申込GAS基盤

Googleフォーム、Google Apps Script、LivePocketのシリアルコード機能を組み合わせた、会員限定チケット申込・抽選・シリアル配布ワークフローの開発基盤です。

現在は開発基盤に加えて、デモ環境向けのフォーム回答処理、会員照合、仮当選、シリアル割当、メールキュー作成、ドライラン付きメール送信を実装しています。本番運用向けの実データやGoogle資産IDは含めません。

## 前提

- Node.js と npm が利用できること。
- Googleアカウントで clasp にログインできること。
- Googleフォーム、回答スプレッドシート、会員名簿、Apps Scriptプロジェクトは手動で作成すること。
- 実ID、会員情報、シリアルコードはGitHubにコミットしないこと。

## セットアップ

```powershell
npm install
npm run clasp:login
Copy-Item .clasp.example.json .clasp.json
```

`.clasp.json` の `scriptId` を実際の Apps Script Project ID に変更します。このファイルはGit管理外です。

## よく使うコマンド

```powershell
npm run typecheck
npm run clasp:version
npm run verify
npm run clasp:push
npm run clasp:open
```

PowerShellの実行ポリシーで `npm` が止まる場合は、`npm.cmd run verify` のように `npm.cmd` を使ってください。

## ディレクトリ

- `src/`: GASにpushするTypeScriptと `appsscript.json` を置く。
- `docs/`: アーキテクチャと実装メモを置く。
- `config/`: 共有可能な設定テンプレートだけを置く。
- `work/`, `outputs/`, `data/`: Git管理外。実データや作業ファイルを置く場合は漏洩に注意する。

## GitHub共有時の注意

共有前に必ず以下を確認します。

```powershell
git status --short
```

`.clasp.json`、`.env`、会員名簿、フォーム回答、LivePocketシリアルコードExcel/CSVが含まれていないことを確認してください。
## デモ版の実行手順

デモ版は本番と混ざらないよう、別GASプロジェクト、別Googleフォーム、別スプレッドシート、デモ専用LivePocketイベントで実行します。

1. デモ専用Googleフォームと回答スプレッドシートを作成する。
2. デモ専用Apps Scriptプロジェクトを作成し、`.clasp.json` の `scriptId` に設定する。
3. GASのScript Propertiesに `.env.example` の `DEMO_` 設定を登録する。`ENVIRONMENT` は必ず `DEMO` にする。
   フォーム回答シートの列名は `タイムスタンプ`、`メールアドレス`、`チケット申し込み枚数`、`申請者名` を想定する。違う場合は `DEMO_FORM_*_HEADER` を実際の列名に合わせる。
   `DEMO_STUDENT_EMAIL_PATTERN` は大学ドメインまで含めた正規表現に調整する。例: `^[a-z](\d{7})@example\.ac\.jp$`
   初回確認では `DEMO_MAIL_DRY_RUN=true` のままにし、実送信する場合だけ `false` に変更する。`DEMO_MAIL_MAX_SEND_PER_RUN` で1回の最大送信数を制限する。
4. `npm run clasp:push` でデモGASへ反映する。
5. GASエディタで `setupDemoSheets` を実行し、デモ管理シートを作る。
6. オリジナル名簿からデモ対象者だけを抽出する場合は、`DEMO_ORIGINAL_ROSTER_*` を設定して `generateDemoMemberRosterFromOriginal` を実行する。手動で行う場合は `DemoMembers` にチームメンバーだけを登録し、`status` を `ACTIVE` にする。
7. LivePocketから取得したデモ専用シリアルコードExcelをGoogle Sheetsの `SerialImport` シートへ取り込み、GASで `importDemoSerialCodesFromSheet` を実行して `DemoSerialCodes` に正規化する。
8. チームメンバーがデモフォームに回答する。
9. `runDemoValidationAndDraft` を実行し、`DemoLotteryDraft` を確認・調整する。
10. `finalizeDemoLottery` を実行し、調整後の仮当選を `DemoLotteryFinal` へ確定コピーする。
11. `runDemoAfterFinalizedLottery` を実行し、確定済みの `DemoLotteryFinal` をもとにシリアル割当と `DemoMailQueue` を作る。
12. `DemoMailQueue` を確認してから `sendDemoMails` を実行する。`DEMO_MAIL_DRY_RUN=true` の場合はGmail送信せず、対象行を `READY` のまま残してエラー欄にドライラン結果を記録する。
13. 実送信する場合は `DEMO_MAIL_DRY_RUN=false` と送信対象件数を確認してから `sendDemoMails` を再実行する。
14. 受信メールのデモLivePocket URLとシリアルコードで申込動作を確認する。

### デモ通し実行

管理者レビューを省略してデモ動作を一気に確認する場合は、`runDemoFullWorkflow` を実行します。

この関数はシート作成、出力シートのリセット、必要に応じた `DemoMembers` 再生成、`SerialImport` からのシリアル再取り込み、`runDemoValidationAndDraft`、`finalizeDemoLottery`、`runDemoAfterFinalizedLottery`、`sendDemoMails` を順に実行します。`DEMO_MAIL_DRY_RUN=true` の場合はGmail送信せず、メールキューの `READY` 行にドライラン結果だけを記録します。

`DEMO_ORIGINAL_ROSTER_SPREADSHEET_ID` が未設定の場合、手入力済みの `DemoMembers` は保持します。設定済みの場合は、元名簿から `DemoMembers` を再生成します。

### デモ混入防止チェック

- `ENVIRONMENT=DEMO` 以外ではデモ処理は停止します。
- 本番フォームID、本番スプレッドシートID、本番LivePocket URLは設定しません。
- 本番会員名簿は参照しません。`DemoMembers` にはチームメンバーだけを入れます。
- `serial_code_group_20260707212505.xlsx` はデモ専用として扱い、GitHubにコミットしません。
- メール件名には `[DEMO]` が付きます。
- 購入完了確認はLivePocket管理画面で手動確認します。
### 名簿生成方針

本番・デモとも、オリジナル名簿をそのまま照合に使わず、申込システムが必要とする標準列へ変換した運用用名簿を使います。

デモでは `generateDemoMemberRosterFromOriginal` が、`DEMO_ORIGINAL_ROSTER_SPREADSHEET_ID` / `DEMO_ORIGINAL_ROSTER_SHEET_NAME` で指定した元名簿から `DemoMembers` を生成します。必要に応じて `DEMO_ORIGINAL_ROSTER_FILTER_HEADER` と `DEMO_ORIGINAL_ROSTER_FILTER_VALUE` で対象者を絞り込みます。

標準列は `studentId`, `email`, `memberName`, `status`, `note` です。照合処理はこの生成後の名簿だけを参照します。
