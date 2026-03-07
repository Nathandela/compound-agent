#!/usr/bin/env node

import { attachSignalHandlers, createProgram, runProgram } from './cli-app.js';

attachSignalHandlers();

await runProgram(createProgram());
