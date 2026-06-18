#!/usr/bin/env bash
set -euo pipefail

API_URL="${REPORTE_API_BASE_URL:-}"

cat > public/runtime-config.js <<EOF
// Generated at build time by scripts/render-build.sh
window.REPORTE_API_BASE_URL = "${API_URL}";
EOF

echo "Generated public/runtime-config.js"
if [ -n "${API_URL}" ]; then
  echo "REPORTE_API_BASE_URL configured"
else
  echo "REPORTE_API_BASE_URL is empty; app will use window.location.origin"
fi
