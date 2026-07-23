# Chat Analiz

Minimal WhatsApp sohbet analiz sitesi. Uygulama statik calisir; sohbet export dosyasi repoya eklenmez ve tarayicida lokal olarak okunur. Runtime'da dis CDN veya font istegi yoktur.

## GitHub Pages

```bash
git add index.html README.md .gitignore vendor/chart.umd.min.js
git commit -m "Publish private local-file chat analyzer"
gh repo create wp-analysis --public --source=. --remote=origin --push
gh api --method POST /repos/isikgirayedu/wp-analysis/pages \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

Site adresi:

```text
https://isikgirayedu.github.io/wp-analysis/
```
