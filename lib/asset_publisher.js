import path from 'path';
import { simpleGit, ResetMode } from 'simple-git';
import { spawnSync } from 'child_process';
import {
  isArray,
  isDataObject,
  isFunction,
  isNonEmptyAbsolutePath,
  isNonEmptyAbsolutePathItemArray,
  isNonEmptyString,
} from './utils/index.js';
import { DEF_SIMPLE_GIT_OPT } from './constants/index.js';
import {
  CtorParamDataObjectError,
  NonArrayError,
  NonEmptyAbsolutePathError,
  NonEmptyAbsolutePathItemArrayError,
} from './utils/error.js';


/**
 * @template CallbackRet
 *
 * @param {{text: string, action: string, callback: () => Promise<CallbackRet>}} param0
 * @returns {Promise<CallbackRet|null>}
 */
async function hintWraper({
  mhint,
  action,
  callback,
}) {
  let ret = null;
  const hintKey = `${action}_${String(Math.random()).slice(2)}`;
  try {
    mHint.start(hintKey);
    ret = await callback();
    mhint.succ(hintKey);
  } catch (error) {
    mHint.fail(hintKey);
    throw error;
  }

  return ret;
}

export class AssetPublisherDefHinter {
  setSimpleGitOptAndBaseDir() {
    return {
      errParam() {},
    };
  }

  execRecoverTasks() {
    return {
      start(hintKey, hintTxt) {},
      succ(hintKey) {},
      fail(hintKey) {},
    };
  }

  pushPostAndAssets() {
    return {
      start(cmd) {},
      end() {},
    };
  }

  push() {
    return {
      cleanTip() {},
      unpushPaths() {},
      err(errMsg) {},
    };
  }

  commitPostAndAssets() {
    return {
      start(hintKey) {},
      succ(hintKey) {},
      fail(hintKey) {},
    };
  }

  backupPrevStaged() {
    return {
      start(hintKey) {},
      succ(hintKey) {},
      fail(hintKey) {},
    };
  }

  recoverAsSucPush() {
    return {
      start(hintKey) {},
      succ(hintKey) {},
      fail(hintKey) {},
    };
  }
}

let hint = new AssetPublisherDefHinter();

export class AssetPublisher {
  static injectHint(extHintIns) {
    hint = extHintIns;
  }

  #git = null;

  #simpleGitOpt = DEF_SIMPLE_GIT_OPT;

  #baseDir = process.cwd();

  #staged = [];

  #assetRecords = [];

  #srcPostpaths = [];

  #srcAssetpaths = [];

  #srcUnpushPaths = [];

  #unpushPaths = [];

  #postAndAssetsCommitId = '';

  #latestCommitId = '';

  #uniqueKey = String(Date.now()).slice(2);

  #recoverQueue = [];

  #pushHooks = {
    beforePush: async () => {},
    afterBackupPrevStaged: async () => {},
    afterCommitPostAndAssets: async () => {},
    beforeSetBackupBranch: async () => {},
    beforePushPostAndAssets: async () => {},
    pushingPostAndAssets: async () => {},
    afterPushPostAndAssets: async () => {},
    recoveringTasks: async (argv) => argv,
  };

  /**
   * @typedef {Object} AssetRecordItem
   * @property {string} postpath
   * @property {string[]} assetpaths
   *
   * @typedef {Object} RecoverQueueItem
   * @property {string} name
   * @property {function():Promise<void>} task
   * @property {string} [hint]
   *
   * @typedef {Object} PushHooks
   * @property {function(): Promise<void>} [beforePush]
   * @property {function(): Promise<void>} [afterBackupPrevStaged]
   * @property {function(): Promise<void>} [beforeSetBackupBranch]
   * @property {function(): Promise<void>} [afterCommitPostAndAssets]
   * @property {function(): Promise<void>} [beforePushPostAndAssets]
   * @property {function(): Promise<void>} [pushingPostAndAssets]
   * @property {function(): Promise<void>} [afterPushPostAndAssets]
   * @property {(param0: RecoverQueueItem) => Promise<void>} [recoveringTasks]
   *
   * @typedef {Object} AssetPublisherCtorParam
   * @property {AssetRecordItem[]} assetRecords
   * @property {object} [simpleGitOpt]
   * @property {PushHooks} [pushHooks]
   *
   * @param {AssetPublisherCtorParam} param
   */
  constructor(param) {
    if (!isDataObject(param)) {
      throw new CtorParamDataObjectError();
    }

    const {
      assetRecords,
      simpleGitOpt,
      pushHooks,
    } = param;
    this.#baseDir = process.cwd();
    this.#setSimpleGitOptAndBaseDirBy({ simpleGitOpt });
    this.#git = simpleGit(this.#simpleGitOpt);
    this.#setAssetRecords(assetRecords);
    this.#setSrcAssetpathsAndSrcPostpaths();
    this.#srcUnpushPaths = [
      ...this.#srcPostpaths,
      ...this.#srcAssetpaths,
    ];
    this.#setPushHooks(pushHooks);
  }

  #execmdSync(cmd, opt = {}) {
    const params = {
      cwd: this.#baseDir,
      shell: true,
      ...opt,
    };
    // console.info(params);
    const ret = spawnSync(cmd, params);
    return ret;
  }

  #setSimpleGitOptAndBaseDirBy({ simpleGitOpt }) {
    if (!simpleGitOpt) {
      this.#baseDir = process.cwd();
      this.#simpleGitOpt = {
        ...DEF_SIMPLE_GIT_OPT,
        baseDir: this.#baseDir,
      };
      return;
    }

    if (!isDataObject(simpleGitOpt)) {
      const pHint = hint.setSimpleGitOptAndBaseDir();
      pHint.errParam('simpleGitOpt muse non-empty data object, use def DEF_SIMPLE_GIT_OPT');
      return;
    }
    if (isNonEmptyString(simpleGitOpt.baseDir)) {
      this.#baseDir = simpleGitOpt.baseDir;
    }

    this.#simpleGitOpt = {
      ...DEF_SIMPLE_GIT_OPT,
      ...simpleGitOpt,
      baseDir: this.#baseDir,
    };
  }

  /**
   * set asset records
   * assetRecords can be a empty array but non-array
   *
   * @param {AssetRecordItem} assetRecords
   * @returns {void}
   */
  #setAssetRecords(assetRecords) {
    if (!isArray(assetRecords)) {
      throw new NonArrayError('assetRecords');
    }

    for (let idx = 0; idx < assetRecords.length; idx += 1) {
      const it = assetRecords[idx];
      if (!isNonEmptyAbsolutePath(it.postpath)) {
        throw new NonEmptyAbsolutePathError('assetRecords[].postpath');
      }

      if (!isNonEmptyAbsolutePathItemArray(it.assetpaths)) {
        throw new NonEmptyAbsolutePathItemArrayError('assetRecords[].assetpaths');
      }
    }

    this.#assetRecords = assetRecords;
  }

  #setPushHooks(pushHooks) {
    if (!pushHooks || !isDataObject(pushHooks)) {
      return;
    }

    Object.keys(this.#pushHooks).forEach((key) => {
      if (isFunction(pushHooks[key])) {
        this.#pushHooks[key] = pushHooks[key];
      }
    });
  }

  async #setLatestCommitId() {
    const ret = await this.#git.log();
    this.#latestCommitId = ret.latest.hash;
  }

  #setSrcAssetpathsAndSrcPostpaths() {
    const srcPostpaths = [];
    let srcAssetpaths = [];

    for (let idx = 0; idx < this.#assetRecords.length; idx += 1) {
      const it = this.#assetRecords[idx];
      srcPostpaths.push(it.postpath);
      srcAssetpaths = [...srcAssetpaths, ...it.assetpaths];
    }

    this.#srcPostpaths = Array.from(new Set(srcPostpaths));
    this.#srcAssetpaths = Array.from(new Set(srcAssetpaths));
  }

  #getUnpushPathsBy({ status }) {
    const statusFiles = status.files || [];
    const unpushFilepaths = statusFiles.map((it) => path.resolve(this.#baseDir, it.path));
    return this.#srcUnpushPaths.filter((it) => unpushFilepaths.includes(it));
  }

  async #commitPostAndAssets() {
    const git = this.#git;
    await git.add(this.#unpushPaths);

    const firstPostname = path.parse(this.#srcPostpaths[0]).name;
    const ret = await git.commit(this.#srcPostpaths.length > 1
      ? `Update ${this.#srcPostpaths.length} articles  including "${firstPostname}", and related resources`
      : `Update "${firstPostname}" article and related resources`);
    this.#postAndAssetsCommitId = ret.commit;
  }

  async #commitPostAndAssetsWithHint() {
    return hintWraper({
      action: 'commitPostAndAssets',
      mHint: hint.commitPostAndAssets(),
      callback: () => this.#commitPostAndAssets(),
    });
  }

  async #addRecoverTask({ name, hint, task }) {
    this.#recoverQueue.push({ name, hint, task });
  }

  async #dumpRecoverTasks() {
    this.#recoverQueue = [];
  }

  async #execRecoverTasks() {
    const recoverQueue = this.#recoverQueue;
    const recoverQueueLen = recoverQueue.length;
    for (let i = 0; i < recoverQueueLen; i += 1) {
      const { name, task, hint: hintTxt } = recoverQueue.pop();
      // if (!hint) {
      //   try {
      //     await this.#pushHooks.recoveringTasks({ name, task, hint });
      //     await task();
      //   } catch (error) {
      //     hinter.errMsg(`task (${name}) recover faill`);
      //   }
      //   continue;
      // }

      const hintKey = `exec_recover_rask_${name}_${String(Date.now()).slice(2)}`;
      const mHint = hint.execRecoverTasks();
      try {
        mHint.start(hintKey, hintTxt)
        // eslint-disable-next-line no-await-in-loop
        await this.#pushHooks.recoveringTasks({ name, task, hint });
        // eslint-disable-next-line no-await-in-loop
        await task();
        mHint.succ(hintKey);
      } catch (error) {
        mHint.fail(hintKey);
      }
    }

    this.#dumpRecoverTasks();
  }

  async #backupPrevStagedBy({ status }) {
    let ret = status;
    const git = this.#git;
    if (status.staged.length) {
      this.#staged = [...status.staged];
      await git.reset(ResetMode.MIXED);
      ret = await git.status();
    }

    return ret;
  }

  #recoverPrevStaged() {
    if (this.#staged.length) {
      const cmd = `git add ${this.#staged.join(' ')}`;
      this.#execmdSync(cmd);
    }
  }

  async #backupPrevStagedWithHintBy({ status }) {
    return hintWraper({
      action: 'backupStaged',
      mHint: hint.backupPrevStaged(),
      callback: async () => this.#backupPrevStagedBy({ status }),
    });
  }

  async #recoverStaged() {
    const staged = this.#staged.filter((it) => !this.#unpushPaths.includes(it));
    if (staged.length) {
      await this.#git.add(staged);
    }
  }

  #resetTolatestCommit() {
    if (this.#latestCommitId) {
      const cmd = `git reset ${this.#latestCommitId}`;
      this.#execmdSync(cmd);
    }
  }

  async #recoverAsSucPush() {
    await this.#recoverStaged();
  }

  async #recoverAsSucPushWithHint() {
    return hintWraper({
      action: 'recoverAsSucPush',
      mHint: hint.recoverAsSucPush(),
      callback: () => this.#recoverAsSucPush(),
    });
  }

  async #pushPostAndAssetsWithHint() {
    const git = this.#git;
    const branchLocal = await git.branchLocal();
    const cmd = `git push origin ${branchLocal.current}`;
    const mHint = hint.pushPostAndAssets();

    await this.#pushHooks.beforePushPostAndAssets();

    mHint.start(cmd);
    this.#execmdSync(cmd, {
      stdio: 'inherit',
    });
    mHint.end();
  }

  async #push() {
    const git = this.#git;
    let status = await git.status();

    status = await this.#backupPrevStagedWithHintBy({ status });
    this.#addRecoverTask({
      name: 'recoverPrevStaged',
      hint: 'Revert prev staged',
      task: this.#recoverPrevStaged.bind(this),
    });
    await this.#pushHooks.afterBackupPrevStaged();
    this.#unpushPaths = this.#getUnpushPathsBy({ status });

    if (!this.#unpushPaths.length) {
      const mHint = hint.push();
      mHint.unpushPaths();
      return;
    }

    await this.#commitPostAndAssetsWithHint();
    this.#addRecoverTask({
      name: 'resetTolatestCommit',
      hint: 'Revert to the record before push',
      task: this.#resetTolatestCommit.bind(this, ResetMode.MIXED),
    });
    await this.#pushHooks.afterCommitPostAndAssets();
    await this.#pushPostAndAssetsWithHint();
    this.#dumpRecoverTasks();
    await this.#pushHooks.afterPushPostAndAssets(this.#postAndAssetsCommitId);
    await this.#recoverAsSucPushWithHint();
  }

  async push() {
    const git = this.#git;
    const status = await git.status();
    const mHint = hint.push();

    if (status.isClean()) {
      mHint.cleanTip();
      return;
    }

    // const curBranch = await git.branchLocal();
    await this.#setLatestCommitId();
    try {
      await this.#pushHooks.beforePush();
      await this.#push();
    } catch (error) {
      // console.log(error)
      mHint.err(error.message);
      await this.#execRecoverTasks();
      // throw error;
    }
  }

  /**
   * cheng workdir whether exist unpush post and its assets
   *
   * @returns {Promise<boolean>}
   */
  async checkIsUnpushPostAndAssets() {
    const git = this.#git;
    let status = await git.status();

    if (status.staged.length) {
      this.#staged = [...status.staged];
      await git.reset(ResetMode.MIXED);
      status = await git.status();
    }

    this.#unpushPaths = this.#getUnpushPathsBy({ status });
    if (this.#staged.length) {
      await git.add(this.#staged);
    }
    return !!this.#unpushPaths.length;
  }
}
