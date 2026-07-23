# Chat Analiz

Password-protected WhatsApp sohbet analiz uygulamasi. GitHub Pages yerine Node backend ile calisir; ham sohbet dosyasi public repoya konmaz.

## Local

```bash
npm install
AUTH_PASSWORD="change-me" COOKIE_SECRET="$(openssl rand -hex 32)" npm start
```

Sonra:

```text
http://127.0.0.1:3000
```

Backend varsayilan olarak once `./data/chat.txt`, yoksa lokal `./_chat.txt` dosyasini okur. Giris yaptiktan sonra arayuzden yeni WhatsApp `.txt` export'u yuklenebilir; dosya `CHAT_WRITE_PATH` veya `CHAT_FILE_PATH` konumuna yazilir.

## Production

GitHub Pages bu surum icin uygun degil, cunku login ve private storage backend gerektiriyor. Backend host icin gereken env degerleri:

```bash
AUTH_PASSWORD="strong-password"
COOKIE_SECRET="openssl-rand-hex-32"
CHAT_FILE_PATH="./data/chat.txt"
PORT="3000"
NODE_ENV="production"
```

Repo sadece kodu tasir. `_chat.txt`, WhatsApp export zipleri, `.env`, `data/`, `node_modules/` ve lokal araclar ignore edilir.

## GitHub Repo

Kod reposunu olusturup pushlamak icin:

```bash
./.tools/gh_2.96.0_macOS_arm64/bin/gh auth login --web --git-protocol https
./scripts/publish-github-repo.sh
```
