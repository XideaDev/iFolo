#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"

# 确保先编译好最新的 .app
"$ROOT/build.sh"

APP="$ROOT/build/iFolo.app"
DMG_DIR="$ROOT/build/dmg_temp"
DMG_OUT="$ROOT/build/iFolo.dmg"

echo "==> 打包 DMG 镜像..."
rm -rf "$DMG_DIR" "$DMG_OUT"
mkdir -p "$DMG_DIR"

# 复制 iFolo.app 到临时打包目录
cp -R "$APP" "$DMG_DIR/"

# 创建 Applications 软链接（拖拽安装）
ln -s /Applications "$DMG_DIR/Applications"

# 生成紧凑只读压缩 DMG
hdiutil create -volname "iFolo" \
  -srcfolder "$DMG_DIR" \
  -ov -format UDZO \
  "$DMG_OUT"

rm -rf "$DMG_DIR"

SIZE=$(du -sh "$DMG_OUT" | cut -f1)
echo "==> DMG 打包完成: $DMG_OUT ($SIZE)"
