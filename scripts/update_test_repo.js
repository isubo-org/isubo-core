import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ensureDirSync } from 'fs-extra/esm';

const TEST_REPO_DIR = '__test__/temp/.cache'
const TEST_REPO_DIR_NAME = 'test-repo_deploy-posts-to-github-issue';
const TEST_REPO_CWD = path.join(TEST_REPO_DIR, TEST_REPO_DIR_NAME);
const cwd = process.cwd();

function execCmdSync(cmd) {
  console.info(cmd);
  execSync(cmd, {
    shell: true,
    stdio: 'inherit',
  });
}

function main() {
  if (fs.existsSync(TEST_REPO_CWD)) {
    process.chdir(TEST_REPO_CWD);
    execCmdSync('git fetch origin master && git checkout master && git pull origin master');
    return;
  }

  ensureDirSync(TEST_REPO_DIR);
  process.chdir(TEST_REPO_DIR);
  execCmdSync(`git clone git@github.com:isaaxite/test-repo_deploy-posts-to-github-issue.git`);
}

main();
