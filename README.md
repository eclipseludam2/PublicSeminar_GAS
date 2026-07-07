# チケット申込GAS基盤

Googleフォーム、Google Apps Script、LivePocketのシリアルコード機能を組み合わせた、会員限定チケット申込・抽選・シリアル配布ワークフローの開発基盤です。

今回は基盤と規約のみを用意しています。フォーム回答処理、会員照合、抽選、シリアル割当、メール送信の本実装は次段階で追加します。

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

