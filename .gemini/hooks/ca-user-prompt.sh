#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca hooks run user-prompt > /dev/null 2>&1
echo '{"decision": "allow"}'
