#!/bin/bash
# Verification script: starts dev server, runs agent-browser checks, then cleans up.
set -m
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null
sleep 1

# Start dev server in background
node node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &
SERVER_PID=$!
echo "Dev server PID: $SERVER_PID"

# Wait for server to be ready (max 30s)
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

echo "================ STEP 1: Open landing/auth page ================"
agent-browser open http://localhost:3000 2>&1 | head -3
sleep 2
agent-browser snapshot -i 2>&1 | head -40

echo "================ STEP 2: Screenshot auth page ================"
agent-browser screenshot /home/z/my-project/verify-auth.png 2>&1 | head -2

# Cleanup
kill $SERVER_PID 2>/dev/null
pkill -f "next dev" 2>/dev/null
echo "Server stopped."
