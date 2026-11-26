// Skyline Courier — the entry program.
// It hands the game in: copies game/ and screenshots/ from this repository
// into the output directory and writes the dossier.json the judge reads,
// built with the kit's vendored library. Run it as:
//   MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
//
// Before copying anything it checks the entry against the scorer's own
// limits, so a bad entry fails here with a plain message instead of
// silently going in invalid: game/index.html must exist and fit in 1 MiB,
// game/ must hold at most 993 files and directories and 48 MiB in all, and
// screenshots/ must hold 3 or 4 JPEG/PNG files of at most 256 KiB each.
// After writing the dossier it reads it back and checks the shape the
// judge expects: a Game block, the sources, and the screenshots it lists.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;
const INDEX_MAX_BYTES = 1048576;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 262144;

// Walk a directory tree and count its plain files and directories, in bytes.
function measureTree(dir) {
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`gate: symlink found under ${path}`);
      if (entry.isDirectory()) {
        dirs += 1;
        stack.push(path);
      } else if (entry.isFile()) {
        files += 1;
        bytes += statSync(path).size;
      }
    }
  }
  return { files, dirs, bytes };
}

function gate() {
  const indexPath = join(here, 'game', 'index.html');
  if (!existsSync(indexPath)) throw new Error('gate: game/index.html is missing');
  const indexStat = statSync(indexPath);
  if (!indexStat.isFile()) throw new Error('gate: game/index.html is not a regular file');
  if (indexStat.size > INDEX_MAX_BYTES) {
    throw new Error(`gate: game/index.html is ${indexStat.size} bytes, over the 1 MiB cap`);
  }
  const game = measureTree(join(here, 'game'));
  if (game.files + game.dirs > GAME_MAX_FILES) {
    throw new Error(`gate: game/ holds ${game.files + game.dirs} files and directories, over 993`);
  }
  if (game.bytes > GAME_MAX_BYTES) {
    throw new Error(`gate: game/ is ${game.bytes} bytes, over the 48 MiB cap`);
  }
  const shotsDir = join(here, 'screenshots');
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length < 3 || shots.length > SHOT_MAX) {
    throw new Error(`gate: screenshots/ holds ${shots.length} images, need 3 or 4`);
  }
  for (const name of shots) {
    const path = join(shotsDir, name);
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name)) throw new Error(`gate: bad screenshot name ${name}`);
    const size = statSync(path).size;
    if (size > SHOT_MAX_BYTES) throw new Error(`gate: screenshots/${name} is ${size} bytes, over 256 KiB`);
  }
  console.log(`gate: index.html ${indexStat.size} bytes, game/ ${game.files} files ${game.bytes} bytes, ${shots.length} screenshots — OK`);
}

gate();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps mirror the scorer's own limits, so a bad entry fails here first:
// at most 160 KiB of dossier text, 4 screenshots of at most 256 KiB each,
// 993 files / 48 MiB under game/, and no game path over 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Read the dossier back and check it carries what the judge reads.
const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
if (typeof dossier !== 'object' || dossier === null) throw new Error('gate: dossier.json is not an object');
if (!Array.isArray(dossier.images) || dossier.images.length < 3 || dossier.images.length > 4) {
  throw new Error(`gate: dossier.json lists ${dossier.images?.length} images, need 3 or 4`);
}
if (typeof dossier.text !== 'string' || !dossier.text.includes('## Game')) {
  throw new Error('gate: dossier.json has no Game block text');
}
if (!dossier.text.includes('game/index.html')) {
  throw new Error('gate: dossier.json does not name game/index.html');
}
console.log(`Skyline Courier handed in to ${out} (dossier ${readFileSync(join(out, 'dossier.json')).length} bytes)`);
