#!/bin/bash
# 星云词汇 · 部署到 GitHub Pages
# 用法：bash deploy.sh
# 首次使用前需先执行：git remote add origin git@github.com:HTTP803/仓库名.git
set -e
cd "$(dirname "$0")"

git add -A
git commit -m "deploy: $(date +%Y-%m-%d_%H:%M)" || echo "（无变更可提交）"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "✗ 未配置 remote，请先执行: git remote add origin git@github.com:HTTP803/仓库名.git"
  exit 1
fi
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
echo "✅ 已推送。GitHub 仓库 Settings → Pages → Source 选 main 分支 /(root)，几分钟后即上线"
