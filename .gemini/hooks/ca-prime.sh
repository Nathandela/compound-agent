#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca prime > /dev/null 2>&1
echo '{"decision": "allow"}'
