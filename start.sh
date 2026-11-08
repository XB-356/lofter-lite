#!/bin/sh
# 启动 LOFTER Lite 本地服务
cd "$(dirname "$0")" || exit 1
exec node server.js
