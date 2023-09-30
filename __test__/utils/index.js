import path from 'path';
import fg from 'fast-glob';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { copySync, removeSync, ensureDirSync } from 'fs-extra/esm';
import { PostParse } from '../../lib/post_parse.js';
import { load as loadYaml, dump as yamlDump } from 'js-yaml';
import { ConfReader } from '../../lib/conf_reader.js';
import { FRONTMATTER } from '../../lib/constants/index.js';
import { postPath } from '../../lib/post_path.js';

const DEST_SOURCE_PATH_PREFIX = '__test__/temp/source_';

export const removeTempPost = (postpath = '') => {
  if (postpath) {
    removeSync(path.parse(postpath).dir);
    return;
  }
  fg.sync([`${DEST_SOURCE_PATH_PREFIX}*/*.md`]).forEach(itPath => {
    removeSync(path.parse(itPath).dir);
  });
}

export const copyTempPost = (param) => {
  const ret = [];
  let srcArr = param;
  const timeStr = String(Date.now()).slice(2);
  const destSourceDir = `${DEST_SOURCE_PATH_PREFIX}${timeStr}`;

  if (typeof param === 'string') {
    srcArr = [param];
  }

  for (const src of srcArr) {
    const srcPathDetail = path.parse(src);
    const srcPostAssetPath = path.join(srcPathDetail.dir, srcPathDetail.name);
    const destPostAssetPath = path.join(destSourceDir, srcPathDetail.name);
    const destPostFilepath = path.join(destSourceDir, srcPathDetail.base);

    copySync(src, destPostFilepath)
    copySync(srcPostAssetPath, destPostAssetPath);

    ret.push({
      filename: srcPathDetail.name,
      filepath: destPostFilepath,
      sourceDir: destSourceDir
    });
  }

  return ret.length > 1 ? ret : ret.pop();
};

export const copyServeralTempPostBy = ({
  srcArr
}) => {
  for (const src of srcArr) {
    copyTempPost(src);
  }
};

export class TempPost {
  #post = null;
  dest = '';
  constructor({ src, conf, disable_asset_find }) {
    const { filepath } = copyTempPost(src);
    this.dest = filepath

    this.#post = new PostParse({
      path: this.dest,
      conf
    });
  }
  getContent() {
    return this.#post.getFormatedMarkdown();
  }
  getFrontmatter() {
    return this.#post.getFrontmatter();
  }
  getData() {
    const ret = {
      formatedMarkdown: this.#post.getFormatedMarkdown(),
      frontmatter: this.#post.getFrontmatter()
    };
    removeTempPost(this.dest);
    return ret;
  }

  destory() {
    removeTempPost(this.dest);
  }
}

/**
 * 
 * @param {Array<{ only?: boolean | undefined, [key: string]: any }>} arr 
 * @returns 
 */
export function detectOnly(arr) {
  const onlyItem = []; 
  const restItems = [];
  for (const it of arr) {
    if (it.only || Object.keys(it).includes('only')) {
      onlyItem.push(it);
    } else {
      restItems.push(it);
    }
  }

  return onlyItem.length ? onlyItem : restItems;
}

export function makeTempConfFile(cb) {
  const destPath = `__test__/temp/isubo.conf_${String(Date.now()).slice(2)}.yml`;
  copySync('__test__/assets/isubo.conf.yml', destPath);
  const preConf = loadYaml(readFileSync(destPath));
  writeFileSync(destPath, yamlDump(cb(preConf)));
  return destPath;
}

export function updateConfFileSync(src, cb) {
  const preConf = loadYaml(readFileSync(src));
  writeFileSync(src, yamlDump(cb(preConf)));
}

export function findImageFrom({ ast }, ret = []) {
  if (ast.type === 'image') {
    ret.push(ast);
    return ast;
  }

  if (!ast.children) {
    return;
  }

  for (const it of ast.children) {
    findImageFrom({ ast: it }, ret);
  }

  return ret;
}

export class TempRepo {
  uniqueKey = `${String(Math.random()).slice(2)}`;
  tempRepo = `__test__/temp/repo_${this.uniqueKey}`;
  tempConfPath = path.join(this.tempRepo, 'isubo.conf.yml');
  tempSourceDir = path.join(this.tempRepo, 'source');
  conf = null;

  copy(cb = val => val) {
    ensureDirSync(this.tempRepo);
    copySync('__test__/assets/isubo.conf.yml', this.tempConfPath);
    postPath.setConfBy({ confpath: this.tempConfPath });
    const preConf = loadYaml(readFileSync(this.tempConfPath));
    preConf.source_dir = this.tempSourceDir;
    writeFileSync(this.tempConfPath, yamlDump(cb(preConf)));
    const confReader = new ConfReader({ path: this.tempConfPath });
    this.conf = confReader.get();
    copySync('__test__/source', this.tempSourceDir);
  }

  remove() {
    removeSync(this.tempRepo);
  }

  resolveFromSourceDir(restPath) {
    const filepath = path.join(this.tempSourceDir, restPath);
    if (!existsSync(filepath)) {
      throw new Error(`${restPath} not exist in ${this.tempSourceDir}, filepath: ${filepath}`);
    }

    return filepath;
  }
}

export function getEnsureDirSync(dirpath) {
  ensureDirSync(dirpath);
  return path.resolve(dirpath);
}

export function getTimestampKey() {
  return String(Date.now()).slice(2);
}

export function copyTempPostWithoutFrontmatter(src) {
  const temp = copyTempPost(src);
  const {
    sourceDir,
    filepath
  } = temp;
  const getPostParse = () => new PostParse({
    path: filepath,
    conf: {
      link_prefix: 'https://isaaxite.github.io/blog/resources/',
      absolute_source_dir: path.resolve(sourceDir)
    },
    disable_immediate_formatAssetLink: true
  });

  const postParse = getPostParse();
  const ast = postParse.getAst();

  if (ast.children[0].type === FRONTMATTER) {
    ast.children = ast.children.slice(1);
  }
  const mdtxt = postParse.getFormatedMarkdown({ ast });
  writeFileSync(filepath, mdtxt);

  return temp;
}


export async function sleep(ms = 1000) {
  return new Promise(fn => setTimeout(() => fn(null), ms))
}

export function sleepFactory(testExec, sleepMs = 1000) {
  return (name, cb, timeout = 5000) => testExec(...[
    name,
    async (...argvs) => {
      await sleep(sleepMs);
      await cb(...argvs);
    },
    timeout + sleepMs
  ]);
}


export function getErrMsgFrom({ throwErrFunc }) {
  try {
    throwErrFunc();
  } catch (error) {
    return error.message;
  }
}