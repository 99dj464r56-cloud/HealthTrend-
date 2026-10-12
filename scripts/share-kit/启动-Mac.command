#!/bin/bash
# 双击运行。首次若提示“无法验证开发者”：右键 → 打开。
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "需要 python3：请在“终端”运行 xcode-select --install 后再试。"
  read -r -p "按回车关闭…" _
  exit 1
fi
exec python3 serve.py 8765
