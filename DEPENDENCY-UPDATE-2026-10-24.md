# 依存更新の記録（2026-10-24）

Viteを7.3.2から同系列の修正版7.3.7へ更新しました。Node22.23.4とNode24対応Actionsへ変更し、PRはビルドのみでPagesをdeployしません。

React、GAS保存・PIN判定・地図・既存レイアウトのコードは変更していません。

## 検証

npm ci、Vite production build、workflow YAML、Chrome headlessで配布bundleのログイン画面表示・実行時例外なしを確認しました。

## 未確認と反映境界

GAS・Google Mapsの実通信、ログイン後の全行程操作、Safari/iPad実機は未確認です。

本記録はブランチ上の変更です。main merge、GitHub Pages本番deploy、nativeリリースは実施していません。

根拠: https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22
