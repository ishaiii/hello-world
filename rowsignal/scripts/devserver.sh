#!/usr/bin/env bash
# Restart the static preview server in the background (used while developing / testing).
cd "$(dirname "$0")/.."
if [ -f /tmp/rowsignal-serve.pid ]; then kill "$(cat /tmp/rowsignal-serve.pid)" 2>/dev/null || true; fi
nohup node scripts/serve.mjs > /tmp/serve.log 2>&1 &
echo $! > /tmp/rowsignal-serve.pid
sleep 1
