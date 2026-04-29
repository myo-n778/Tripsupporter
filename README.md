# TripSupporter

観光ルート作成アプリを Vite + React で動かすためのプロジェクトです。

## セットアップ

```bash
npm install
```

## ローカル起動

```bash
npm run dev
```

起動後、次の URL を開きます。

```text
http://127.0.0.1:5173/
```

## 環境変数

`.env.local` に次を設定します。

```bash
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_GAS_URL=https://script.google.com/macros/s/your_deployment_id/exec
VITE_GAS_PROXY_URL=/gas
VITE_ADMIN_PIN=admin
```

ローカル開発時は `/gas` を Vite の開発用中継として使い、GAS への通信を代理実行します。本番ビルドでは `VITE_GAS_URL` を直接参照します。

## 管理者ログイン

班番号に `admin`、PINに `.env.local` の `VITE_ADMIN_PIN` を入力します。

初期値は次です。

```text
admin
```

## 確認コマンド

```bash
npm run build
```

## GitHub Pages で公開

GitHub の repository `Settings` → `Pages` で、`Build and deployment` の `Source` を `GitHub Actions` にします。

Repository secrets に次を設定します。

```text
VITE_GOOGLE_MAPS_API_KEY
VITE_GAS_URL
VITE_ADMIN_PIN
```

`main` ブランチへ push すると、`.github/workflows/deploy.yml` が `npm run build` を実行し、`dist` を GitHub Pages へ公開します。

Google Maps API キーには、公開後の GitHub Pages URL を HTTP リファラー制限として追加してください。

## 現在の注意点

ローカルの `/gas` プロキシは応答していますが、現在の GAS は JSON ではなく次のエラーページを返しています。

```text
SyntaxError: Unexpected token 'A', "A" is not valid JSON（行 37、ファイル「研修旅行」）
```

そのため、フロントエンドは起動できますが、GAS 側のデータ取得・保存を完了させるには Apps Script 側の修正が必要です。
