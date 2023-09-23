import path from 'path';
import clipboard from 'clipboardy';
import { ConfReader } from './lib/conf_reader.js';
import { PostManager } from './lib/post_manager.js';
import { PostParse } from './lib/post_parse.js';
import { AssetPublisher } from './lib/asset_publisher.js';
import { enumDeployType } from './lib/constants/enum.js';
import { postPath } from './lib/post_path.js';
import {
  isAtLeastOneOf, isDataObject, isFunction, isNonEmptyArray, isUndefined, requestQueue,
} from './lib/utils/index.js';
import { AtLeastPropError, CtorParamDataObjectError, DataObjectError } from './lib/utils/error.js';

export class IsuboCore {
  #conf = {};

  #cliParams = {};

  #postManager = null;

  #assetpathRecords = [];

  #hooks = {
    beforeDeploy: async () => {},
  };

  /**
   * @typedef {Object} CliParams
   * @property {string|string[]} filename
   *
   * @typedef {Object.<string, *>} IsuboConf
   * @property {string|string[]} filename
   *
   * @typedef {Object} Hooks
   * @property {function():Promise<void>} beforeDeploy
   *
   * @typedef {Object} IsuboCtorParam0 - init with confPath
   * @property {string} confPath
   * @property {CliParams} [cliParams]
   * @property {boolean} [selectPosts]
   * @property {Hooks} [hooks]
   *
   * @typedef {Object} IsuboCtorParam1 - init with config data
   * @property {IsuboConf} conf
   * @property {CliParams} [cliParams]
   * @property {Hooks} [hooks]
   *
   * @param {IsuboCtorParam0|IsuboCtorParam1} param
   */
  constructor(param) {
    if (!isDataObject(param)) {
      throw new CtorParamDataObjectError();
    }

    const {
      confPath,
      conf,
      cliParams,
      hooks,
    } = param;

    this.#setConfByOneOf({
      conf,
      confPath,
    });
    // TODO: compatile the input of filename and patterns
    this.#setHooks(hooks);
    this.#setCliParams(cliParams);
    this.#setPostManager();
  }

  #setHooks(hooks) {
    if (!isDataObject(hooks)) {
      return;
    }

    if (isFunction(hooks.beforeDeploy)) {
      this.#hooks.beforeDeploy = hooks.beforeDeploy;
    }
  }

  /**
   * set cliParams and validate it
   * @param {CliParams} cliParams
   */
  #setCliParams(cliParams) {
    if (isUndefined(cliParams)) {
      return;
    }

    if (!isDataObject(cliParams)) {
      throw new DataObjectError('cliParams');
    }

    // if (
    //   !isNonEmptyString(cliParams.filename)
    //   && !isNonEmptyStringItemArray(cliParams.filename)
    // ) {
    //   throw new NonEmptyStringOrNonEmptyStringItemArrayError('cliParams.filename');
    // }

    // if (!isUndefined(cliParams.filename) )

    this.#cliParams = cliParams;
  }

  #setConfByOneOf({
    conf,
    confPath,
  }) {
    if (!isAtLeastOneOf(conf, confPath)) {
      throw new AtLeastPropError('conf, confPath');
    }

    if (!isUndefined(conf)) {
      if (!isDataObject(conf)) {
        throw new DataObjectError('conf');
      }
      // TODO: use ConfReader to format input-conf
      this.#conf = conf;
    } else {
      const confReader = new ConfReader({ path: confPath });
      this.#conf = confReader.get();
    }

    postPath.init(this.#conf);
  }

  #setPostManager() {
    const conf = this.#conf;
    this.#postManager = new PostManager({
      owner: conf.owner,
      repo: conf.repo,
      token: conf.token,
    });
  }

  /**
   * add record for asset paths of the post,
   * add only if assets exist
   *
   * @param {string} postpath - post path
   * @param {string[]} assetpaths - asset paths of the post
   * @returns
   */
  #addAssetpathRecord(postpath, assetpaths) {
    if (!assetpaths.length) {
      return;
    }
    const { absolute_source_dir } = this.#conf;
    this.#assetpathRecords.push({
      postpath: path.resolve(absolute_source_dir, postpath),
      assetpaths: assetpaths.map((assetpath) => path.resolve(absolute_source_dir, assetpath)),
    });
  }

  #getPostDetailBy({ filepath }) {
    const conf = this.#conf;
    const postParse = new PostParse({
      path: filepath,
      conf,
      disableBack2top: !!this.#cliParams?.disableBack2top,
      disableToc: !!this.#cliParams?.disableToc
    });
    const inputMarkdown = postParse.getInputMarkdown();
    const frontmatter = postParse.getFrontmatter();
    const formatedMarkdown = postParse.getFormatedMarkdown();
    const { assetPathsRelativeRepoArr } = postParse;
    return {
      postParse,
      inputMarkdown,
      frontmatter,
      formatedMarkdown,
      assetPathsRelativeRepoArr,
      injectFrontmatterFn: (...args) => postParse.injectFrontmatter(...args),
    };
  }

  // eslint-disable-next-line class-methods-use-this
  #getPostTitleBy({ frontmatter, filepath }) {
    if (!frontmatter.title) {
      return postPath.parse(filepath).postTitle;
    }

    return frontmatter.title;
  }

  async #updateOneBy({ filepath }) {
    const {
      frontmatter,
      formatedMarkdown,
      assetPathsRelativeRepoArr,
    } = this.#getPostDetailBy({ filepath });
    const title = this.#getPostTitleBy({ frontmatter, filepath });
    this.#addAssetpathRecord(filepath, assetPathsRelativeRepoArr);
    const ret = await this.#postManager.update({
      title,
      labels: frontmatter.tags,
      issue_number: frontmatter.issue_number,
      body: formatedMarkdown,
    });

    return ret;
  }

  async #createOneBy({ filepath }) {
    const {
      frontmatter,
      formatedMarkdown,
      assetPathsRelativeRepoArr,
      injectFrontmatterFn,
    } = this.#getPostDetailBy({ filepath });
    const title = this.#getPostTitleBy({ frontmatter, filepath });
    this.#addAssetpathRecord(filepath, assetPathsRelativeRepoArr);
    const params = {
      title,
      body: formatedMarkdown,
    };
    if (isNonEmptyArray(frontmatter.tags)) {
      params.labels = frontmatter.tags;
    }
    const ret = await this.#postManager.forceCreate(params);

    // TODO: check forceCreate success or not

    const injectedFrontmatter = {
      issue_number: ret.data.number,
    };
    if (!frontmatter.title) {
      injectedFrontmatter.title = title;
    }

    injectFrontmatterFn(injectedFrontmatter);

    return ret;
  }

  async #publishOneBy({
    filepath,
    hintUpdate
  } = {}) {
    let type;
    const lastHintUpdate = hintUpdate || (() => {});
    const { frontmatter } = this.#getPostDetailBy({ filepath });
    if (frontmatter.issue_number) {
      type = enumDeployType.UPDATE;
      lastHintUpdate(type, filepath);
      return {
        type,
        ret: await this.#updateOneBy({ filepath }),
      };
    }
    type = enumDeployType.CREATE;
    lastHintUpdate(type, filepath);
    return {
      type,
      ret: await this.#createOneBy({ filepath }),
    };
  }

  async #publishAssets() {
    const conf = this.#conf;
  
    const assetPublisher = new AssetPublisher({
      conf,
      assetRecords: this.#assetpathRecords,
    });
    return await assetPublisher.push();
  }

  // eslint-disable-next-line class-methods-use-this
  async #requestQueue(requests) {
    return requestQueue(requests, {
      maxRequests: 6,
      timeout: 10 * 1000,
    });
  }

  async create({
    filepathArr,
    hint,
  } = {}) {
    const hintStart = hint?.start || (() => {});
    const hintSucc = hint?.succ|| (() => {});
    const hintFail = hint?.fail || (() => {});
    const STR_TPYE = enumDeployType.CREATE;
    const retArr = [];

    if (!filepathArr?.length) {
      return retArr;
    }

    // TODO: without select should stop at here!

    await this.#requestQueue(filepathArr.map((filepath) => async () => {
      try {
        hintStart(STR_TPYE, filepath);
        await this.#hooks.beforeDeploy();
        retArr.push(await this.#createOneBy({ filepath }));
        hintSucc(filepath);
      } catch (error) {
        const { postTitle } = postPath.parse(filepath);
        hintFail(STR_TPYE, filepath, {
          errMsg: error.message,
          postTitle,
        });
        throw error;
      }
    }));

    // TODO: if exist deploy item err, it's record should be remove from this.#assetpathRecords
    await this.#publishAssets();

    return retArr;
  }

  async update({
    filepathArr,
    hint
  } = {}) {
    const hintStart = hint?.start || (() => {});
    const hintSucc = hint?.succ|| (() => {});
    const hintFail = hint?.fail || (() => {});
    const STR_TPYE = enumDeployType.UPDATE;
    const retArr = [];

    if (!filepathArr?.length) {
      return retArr;
    }

    await this.#requestQueue(filepathArr.map((filepath) => async () => {
      try {
        hintStart(STR_TPYE, filepath);
        await this.#hooks.beforeDeploy();
        retArr.push(await this.#updateOneBy({ filepath }));
        hintSucc(filepath);
      } catch (error) {
        const { postTitle } = postPath.parse(filepath);
        hintFail(STR_TPYE, filepath, {
          errMsg: error.message,
          postTitle,
        });
        throw error;
      }
    }));

    await this.#publishAssets();

    return retArr;
  }

  async publish({
    filepathArr,
    hint
  } = {}) {
    let type = enumDeployType.PUBLISH;
    const hintStart = hint?.start || (() => {});
    const hintStartUpdate = hint?.startUpdate || (() => {});
    const hintSucc = hint?.succ|| (() => {});
    const hintFail = hint?.fail || (() => {});
    const hintErr = hint?.err || (() => {});
    const retArr = [];

    if (!filepathArr?.length) {
      return retArr;
    }

    await this.#requestQueue(filepathArr.map((filepath) => async () => {
      try {
        hintStart(type, filepath);
        await this.#hooks.beforeDeploy();
        const resp = await this.#publishOneBy({
          filepath,
          hintUpdate: hintStartUpdate
        });
        type = resp.type;
        retArr.push({
          filepath,
          ret: resp.ret,
        });
        hintSucc(type, filepath);
      } catch (error) {
        retArr.push({
          filepath,
          ret: error,
        });
        hintFail(type, filepath);
        hintErr(error.message);
        throw error;
      }
    }));

    await this.#publishAssets();

    return retArr;
  }

  async writeToClipboard({
    filepathArr,
  } = {}) {
    const writeToClipboardOneBy = ({ filepath }) => {
      const {
        frontmatter,
        formatedMarkdown,
        assetPathsRelativeRepoArr,
      } = this.#getPostDetailBy({ filepath });
      const title = this.#getPostTitleBy({ frontmatter, filepath });
      this.#addAssetpathRecord(filepath, assetPathsRelativeRepoArr);
      clipboard.writeSync(formatedMarkdown);

      return {
        title,
        frontmatter,
        formatedMarkdown,
      };
    };

    if (!filepathArr?.length) {
      return;
    }

    return writeToClipboardOneBy({ filepath: filepathArr[0] });
  }
}
