#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2).join(' ');
const exportScript = path.join(__dirname, 'export-html.js');
const gamePath = path.join(__dirname, '..', 'dist', 'game.html');

execSync(`node "${exportScript}" ${args}`, { stdio: 'inherit' });

import('open').then(m => m.default(gamePath));
