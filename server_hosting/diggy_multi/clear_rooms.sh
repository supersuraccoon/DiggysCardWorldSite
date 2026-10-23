#!/usr/bin/env bash
# Diggy 多人 · 清废房（本机调用线上 clear_rooms.php）
#
# 前提：已把 clear_rooms.php 上传到主机 diggy_multi/ 目录。
# 本机一般对共享主机 FTP 不便脚本化；推荐面板文件管理上传 PHP，再用本脚本 curl。
# 用完请在面板删掉线上的 clear_rooms.php。
#
# 用法：
#   ./clear_rooms.sh
#   BASE=https://supersuraccoon-cocos2d.com/diggy_multi ./clear_rooms.sh

set -euo pipefail
BASE="${BASE:-https://supersuraccoon-cocos2d.com/diggy_multi}"
KEY="${KEY:-diggy_clear_rooms}"
URL="${BASE%/}/clear_rooms.php?key=${KEY}"

echo "GET $URL"
curl -sS "$URL"
echo
echo "Done. Verify: curl -sS ${BASE%/}/room.php  (roomCount should be 0)"
echo "Then delete clear_rooms.php on the host via File Manager."
