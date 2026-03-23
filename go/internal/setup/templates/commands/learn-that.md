---
name: compound:learn-that
description: Conversation-aware lesson capture with user confirmation
argument-hint: "<insight to remember>"
---
# Learn That

If $ARGUMENTS is provided, use it as the insight. Otherwise, analyze the conversation for corrections, discoveries, or fixes worth capturing.

Formulate:
- **Trigger**: What situation should recall this lesson?
- **Insight**: What should be done differently?
- **Tags**: 2-4 lowercase keywords

Confirm with the user via AskUserQuestion before saving.

Then run:

```bash
ca learn "$ARGUMENTS" --tags "<tag1>,<tag2>"
```
