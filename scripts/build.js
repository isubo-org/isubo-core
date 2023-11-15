import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const conf = {
  pkgJsonPath: './package.json',
  distDirPath: './dist'
};

function streamlog(text) {
  process.stderr.write(text + '\n');
}

function getPkgData() {
  const ret = JSON.parse(fs.readFileSync(conf.pkgJsonPath, 'utf8'));
  return ret;
}

function excludeProps(src, ...keys) {
  const ret = {};
  for (const [key, val] of Object.entries(src)) {
    if (!keys.includes(key)) {
      ret[key] = val;
    }
  }
  return ret;
}

export function deleteScripts() {
  const pkgJson = getPkgData();
  let distPkg = pkgJson;
  const PUBLISH_CWD = conf.distDirPath;
  const distPkgPath = path.join(PUBLISH_CWD, 'package.json');
  let shouldUpdate = false;

  if (!fs.existsSync(distPkgPath)) {
    throw new Error(`${distPkgPath} not exist!`);
  }

  if (pkgJson?.scripts) {
    distPkg = {
      ...pkgJson,
      scripts: excludeProps(
        pkgJson.scripts,
        'build',
        'prepare',
        'publish',
        'postversion',
      )
    };

    shouldUpdate = true;
  }

  if (pkgJson?.type) {
    delete distPkg.type;
    shouldUpdate = true;
  }

  if (pkgJson?.directories) {
    delete distPkg.directories;
    shouldUpdate = true;
  }

  if (shouldUpdate) {
    execSync(`echo 1`, {
      stdio: 'inherit',
      shell: true
    });
    fs.writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2));
  }

  execSync(`pwd && cat ${distPkgPath}`, {
    stdio: 'inherit',
    shell: true
  });
}

function main() {
  let cmd = `rm -rf dist && npx rollup -c rollup.config.js`;
  streamlog(cmd);

  execSync(cmd, {
    stdio: 'inherit',
    shell: true
  });

  deleteScripts();

  cmd = 'du -sh dist';
  streamlog('\n' + cmd);

  execSync(cmd, {
    stdio: 'inherit',
    shell: true
  });

  process.exit(1);
}

main();
