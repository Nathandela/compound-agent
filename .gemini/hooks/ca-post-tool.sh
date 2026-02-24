#!/usr/bin/env bash
input=$(cat)
echo "$input" | npx ca hooks run post-tool-success > /dev/null 2>&1
echo '{"decision": "allow"}'
