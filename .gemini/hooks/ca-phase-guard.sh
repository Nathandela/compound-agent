#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca hooks run phase-guard > /dev/null 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  echo '{"decision": "deny", "reason": "Phase guard: read the phase skill before editing"}'
  exit 0
fi
echo '{"decision": "allow"}'
