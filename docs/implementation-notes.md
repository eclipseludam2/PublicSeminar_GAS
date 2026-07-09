# 実装メモ

## 今回の状態

このリポジトリには開発基盤とデモ版GAS実装があります。本番運用向けの実データ、Google資産ID、会員名簿、シリアルコード実ファイルは含めません。

現在あるもの:

- npm + TypeScript + clasp の開発基盤
- GAS用 `src/appsscript.json`
- GAS疎通確認用 `healthCheck`
- GitHub共有向けの秘密情報除外ルール
- デモ環境向けのフォーム回答検証、会員照合、重複申込検出、仮当選作成、確定後シリアル割当、メールキュー作成、ドライラン付きメール送信
- 将来の本番実装に向けたアーキテクチャメモ

## 将来実装する責務

- フォーム回答取り込み
- 大学メールアドレスから学籍番号抽出
- 会員名簿照合
- 例外データ抽出
- 抽選候補プール生成
- 仮当選生成
- 管理者レビュー後の当落確定
- LivePocketシリアルコードExcel取り込み
- 当選者へのシリアルコード割当保存
- メール本文生成
- メール送信と送信状態管理

## 推奨するシート構成

- `FormResponses`: Googleフォーム回答の原本。
- `Members`: 会員名簿。学籍番号をキーにする。
- `ValidatedApplications`: 会員照合済みの有効申込。
- `ApplicationExceptions`: 形式異常や会員照合失敗など。
- `LotteryDraft`: GASが作成する仮当選結果。
- `LotteryFinal`: 管理者が確定した当落結果。
- `SerialCodes`: LivePocketから取り込んだシリアルコード。
- `SerialAssignments`: 申込者とシリアルコードの対応関係。
- `MailQueue`: メール送信対象、送信状態、送信日時、エラー内容。

## 未決定事項

- Googleフォームの正確な設問名。
- 会員名簿の列名と更新方法。
- 大学メールドメインの正式な文字列。
- 紹介情報を抽選ロジックにどう反映するか。
- 1人あたりの最大申込枚数を設けるか。
- 当選者がLivePocketで購入しなかった場合の再配布運用。
- メール本文の正式文面。
- Workspaceアカウントへ切り替える送信件数の基準。

## 実装時の注意

- フォーム回答原本は上書きしない。
- 例外データは削除せず、原因を記録する。
- 抽選確定前にシリアルコードやメール送信を行わない。
- シリアルコードは1コード1チケットとして扱い、重複割当を禁止する。
- メール送信前に必ずプレビューまたはドライランを用意する。
- 送信済み行を再送しないための状態管理を必ず入れる。
## デモ版実装

デモ版では `ENVIRONMENT=DEMO` を必須にし、別GASプロジェクト・別フォーム・別スプレッドシート・デモ専用LivePocket URLだけを参照します。

公開関数:

- `setupDemoSheets`: デモ管理シートを作成する。
- `importDemoSerialCodesFromSheet`: LivePocket ExcelをGoogle Sheetsへ取り込んだ `SerialImport` から `DemoSerialCodes` へ正規化する。
- `validateDemoApplications`: フォーム回答をデモ名簿と照合し、有効申込と例外に分ける。同じ学籍番号の有効申込は2件目以降を重複例外にする。
- `createDemoLotteryDraft`: 有効申込から仮当選を作成する。
- `finalizeDemoLottery`: 管理者調整後の仮当選を確定結果へコピーする。
- `allocateDemoSerialCodes`: `DemoSerialCodes` の未割当シリアルを当選枚数分だけ割り当てる。
- `buildDemoMailQueue`: 当選者ごとのメール本文を作る。
- `sendDemoMails`: `READY` のメールを送信またはドライラン処理し、送信状態を更新する。既定では `DEMO_MAIL_DRY_RUN=true` のためGmail送信しない。
- `runDemoValidationAndDraft`: 照合から仮当選作成までをまとめて実行する。
- `runDemoAfterFinalizedLottery`: 確定済みの `DemoLotteryFinal` をもとに、シリアル割当とメールキュー作成をまとめて実行する。`DemoLotteryFinal` は上書きしない。
- `runDemoFullWorkflow`: デモ確認用に、シート作成、出力シートのリセット、必要に応じた名簿生成、シリアル再取り込み、照合、仮当選作成、即時確定、シリアル割当、メールキュー作成、メール送信またはドライランまでをまとめて実行する。

デモ用シリアルコードExcelはGit管理外で扱います。Google Sheetsに取り込む場合は、LivePocket Excelの `シリアルコード` 列を `DemoSerialCodes.serialCode` として扱い、追加列 `assignedApplicationId` と `assignedAt` はGASが更新します。

デモメールはフォーム回答者へ実送信します。送信前に `DemoMailQueue` を確認し、件名に `[DEMO]` が付いていること、本文URLがデモLivePocket URLであることを確認します。
## 元名簿生成の注意

オリジナル名簿はGit管理外のGoogle Sheetsとして扱います。GASには列名とフィルタ条件だけを設定し、生成後の `DemoMembers` / 将来の本番用 `Members` を照合対象にします。

元名簿から生成する際は、重複した `studentId` をエラーにし、不要な列は生成済み名簿へ持ち込みません。デモではチームメンバーだけが残るよう、フィルタ列と値を設定してください。
