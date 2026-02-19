#!/usr/bin/env bash
# OverClaw Node Agent — registers this machine and sends heartbeats
set -e

SERVER_URL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER_URL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$SERVER_URL" ]; then
  echo "Usage: curl -sSL http://<server>/install-agent.sh | bash -s -- --server http://<server-url>"
  exit 1
fi

# Detect system info
HOSTNAME=$(hostname)
OS=$(uname -s)
ARCH=$(uname -m)
CPUS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)

if [ "$OS" = "Darwin" ]; then
  OS_PRETTY="macOS $(sw_vers -productVersion 2>/dev/null || echo 'unknown')"
  MEM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  MEM_GB=$(( MEM_BYTES / 1073741824 ))
elif [ "$OS" = "Linux" ]; then
  OS_PRETTY="Linux $(uname -r)"
  MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
  MEM_GB=$(( ${MEM_KB:-0} / 1048576 ))
else
  OS_PRETTY="$OS $(uname -r)"
  MEM_GB=0
fi

MEMORY="${MEM_GB}GB"
NODE_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')

echo "🔧 OverClaw Node Agent"
echo "   Hostname: $HOSTNAME"
echo "   OS:       $OS_PRETTY"
echo "   Arch:     $ARCH"
echo "   CPUs:     $CPUS"
echo "   Memory:   $MEMORY"
echo ""

# Register
echo "📡 Registering with $SERVER_URL ..."
REGISTER_RESP=$(curl -sS -X POST "$SERVER_URL/api/nodes/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$HOSTNAME\",\"type\":\"personal\",\"hostname\":\"$HOSTNAME\",\"os\":\"$OS_PRETTY\",\"arch\":\"$ARCH\",\"cpus\":$CPUS,\"memory\":\"$MEMORY\",\"tags\":[]}")

# Extract node ID from response
REGISTERED_ID=$(echo "$REGISTER_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$REGISTERED_ID" ]; then
  echo "❌ Registration failed: $REGISTER_RESP"
  exit 1
fi

echo "✅ Registered as node $REGISTERED_ID"
echo "💓 Starting heartbeat loop (every 30s). Press Ctrl+C to stop."
echo ""

# Heartbeat loop
while true; do
  curl -sS -X POST "$SERVER_URL/api/nodes/$REGISTERED_ID/heartbeat" \
    -H "Content-Type: application/json" \
    -d '{}' > /dev/null 2>&1 && echo "$(date '+%H:%M:%S') ♥ heartbeat" || echo "$(date '+%H:%M:%S') ✗ heartbeat failed"
  sleep 30
done
