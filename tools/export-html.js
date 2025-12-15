#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT_DIR, 'game', 'game.pzs');
const TEMPLATE_PATH = path.join(ROOT_DIR, 'puzzlescript', 'standalone_inlined.txt');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_PATH = path.join(DIST_DIR, 'game.html');

function stripArmorGamesElements(html) {
  // Remove the Armor Games footer
  html = html.replace(/<div class="footer">.*?<\/div>/s, '');
  
  // Remove the play button image
  html = html.replace(/<img id="playbutton"[^>]*>/g, '');
  
  // Remove the video element and its script
  html = html.replace(/<video id="video"[\s\S]*?<\/video>/g, '');
  html = html.replace(/<script>var video=document\.getElementById\("video"\)[\s\S]*?<\/script>/g, '');
  
  // Fix canvas to show immediately (remove display:none from #gameCanvas style)
  html = html.replace(/#gameCanvas\{[^}]*display:none;/g, (match) => {
    return match.replace('display:none;', '');
  });
  
  // Remove video-related CSS
  html = html.replace(/#video\{[^}]*\}/g, '');
  html = html.replace(/#playbutton\{[^}]*\}/g, '');
  
  return html;
}

function parseMetadata(sourceCode) {
  const metadata = {};
  const lines = sourceCode.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.startsWith('===') || trimmed.startsWith('========')) {
      break;
    }
    
    const match = line.match(/^(\w+)\s+(.+)$/i);
    if (match) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      metadata[key] = value;
    }
  }
  
  return metadata;
}

function skipToLevel(sourceCode, targetLevel) {
  const levelsMatch = sourceCode.match(/(=+\s*\nLEVELS\s*\n=+\s*\n)([\s\S]*)/i);
  if (!levelsMatch) return sourceCode;
  
  const beforeLevels = sourceCode.slice(0, levelsMatch.index);
  const levelsHeader = levelsMatch[1];
  const levelsContent = levelsMatch[2];
  
  // Split by MESSAGE to find level boundaries
  const levelChunks = levelsContent.split(/(?=MESSAGE\s+Level\s+\d+)/i);
  
  // Find the target level
  const targetIndex = levelChunks.findIndex(chunk => 
    new RegExp(`MESSAGE\\s+Level\\s+${targetLevel}\\b`, 'i').test(chunk)
  );
  
  if (targetIndex === -1) {
    console.warn(`Warning: Level ${targetLevel} not found, using all levels`);
    return sourceCode;
  }
  
  // Keep only levels from target onwards
  const newLevelsContent = levelChunks.slice(targetIndex).join('');
  return beforeLevels + levelsHeader + newLevelsContent;
}

function main() {
  const useArmorGames = process.argv.includes('--armorgames');
  const levelArg = process.argv.find(arg => arg.startsWith('--level='));
  const targetLevel = levelArg ? parseInt(levelArg.split('=')[1], 10) : null;
  
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`Error: Source file not found: ${SOURCE_PATH}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Error: Template file not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }
  
  let sourceCode = fs.readFileSync(SOURCE_PATH, 'utf8');
  let htmlString = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  
  // Skip to specific level if requested
  if (targetLevel) {
    sourceCode = skipToLevel(sourceCode, targetLevel);
    // Inject script to clear localStorage save data so "continue" doesn't override
    const clearSaveScript = `<script>localStorage.removeItem(document.URL);localStorage.removeItem(document.URL+'_checkpoint');</script>`;
    htmlString = htmlString.replace('</head>', clearSaveScript + '</head>');
    console.log(`Starting from level ${targetLevel}`);
  }
  
  // Strip Armor Games branding unless --armorgames flag is passed
  if (!useArmorGames) {
    htmlString = stripArmorGamesElements(htmlString);
  }
  
  const metadata = parseMetadata(sourceCode);
  
  const title = metadata.title || 'PuzzleScript Game';
  const homepage = metadata.homepage || '';
  
  if (metadata.background_color) {
    htmlString = htmlString.replace(/black;\/\*Don't/g, `${metadata.background_color};/*Don't`);
  }
  
  if (metadata.text_color) {
    htmlString = htmlString.replace(/lightblue;\/\*Don't/g, `${metadata.text_color};/*Don't`);
  }
  
  htmlString = htmlString.replace(/__GAMETITLE__/g, title);
  htmlString = htmlString.replace(/__HOMEPAGE__/g, homepage);
  
  // Escape the source code as a JavaScript string literal
  let escapedSource = sourceCode
    .replace(/\\/g, '\\\\')           // Escape backslashes first
    .replace(/"/g, '\\"')             // Escape double quotes
    .replace(/\n/g, '\\n')            // Escape newlines
    .replace(/\r/g, '\\r')            // Escape carriage returns
    .replace(/\t/g, '\\t');           // Escape tabs
  
  // Wrap in quotes to make it a valid JS string
  escapedSource = '"' + escapedSource + '"';
  
  // $ has special meaning in String.replace, escape as $$
  escapedSource = escapedSource.replace(/\$/g, '$$$$');
  
  htmlString = htmlString.replace(/__GAMEDAT__/g, escapedSource);
  
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_PATH, htmlString, 'utf8');
  
  console.log(`Successfully exported: ${OUTPUT_PATH}`);
  if (useArmorGames) {
    console.log('(Using Armor Games template with play button and intro video)');
  } else {
    console.log('(Using clean template - no splash screen or branding)');
  }
}

main();
