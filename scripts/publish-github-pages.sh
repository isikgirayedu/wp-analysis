#!/usr/bin/env bash
set -euo pipefail

OWNER="isikgirayedu"
REPO="wp-analysis"
BRANCH="main"
SITE_URL="https://${OWNER}.github.io/${REPO}/"

if command -v gh >/dev/null 2>&1; then
  GH_BIN="$(command -v gh)"
elif [ -x "./.tools/gh_2.96.0_macOS_arm64/bin/gh" ]; then
  GH_BIN="./.tools/gh_2.96.0_macOS_arm64/bin/gh"
else
  echo "gh bulunamadi. Once GitHub CLI kur veya bu projedeki lokal .tools/gh kurulumunu hazirla."
  exit 1
fi

if ! "$GH_BIN" auth status >/dev/null 2>&1; then
  echo "GitHub oturumu yok. Once su komutu calistir:"
  echo "$GH_BIN auth login --web --git-protocol https"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commitlenmemis degisiklik var. Once commit at."
  exit 1
fi

if "$GH_BIN" repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/${OWNER}/${REPO}.git"
  fi
  git push -u origin "${BRANCH}"
else
  "$GH_BIN" repo create "${REPO}" --public --source=. --remote=origin --push
fi

if ! "$GH_BIN" api "/repos/${OWNER}/${REPO}/pages" >/dev/null 2>&1; then
  "$GH_BIN" api --method POST "/repos/${OWNER}/${REPO}/pages" \
    -f "source[branch]=${BRANCH}" \
    -f "source[path]=/"
fi

echo "GitHub Pages hazirlanıyor: ${SITE_URL}"
