import path from 'path';
import { IsuboCore } from "../../index.js";
import { PostParse } from "../../lib/post_parse.js";
import { TempGitRepo, TempRepo, getTimestampKey } from "../utils/index.js";
import { enumPushAssetType } from '../../lib/constants/enum.js';
import { ensureDirSync, ensureFileSync } from 'fs-extra';
import { writeFileSync } from 'fs';
import clipboard from 'clipboardy';

function createPostsFactory({
  filename,
  createParams,
  titleMaptoFilename
}) {
  return async ({ push_asset }) => {
    const tempGitRepo = new TempGitRepo();
    await tempGitRepo.init({
      preConf(conf) {
        conf.source_dir = tempGitRepo.sourceDir;
        conf.push_asset = push_asset;
      }
    });

    const conf = tempGitRepo.conf;
    const params = { conf };
    if (filename) {
      const newFilename = [];
      for (const it of filename) {
        const { postpath } = tempGitRepo.addNewPostSync(it);
        newFilename.push(path.basename(postpath));
      }
      params.cliParams = { filename: newFilename };
    }

    const precwd = process.cwd();
    process.chdir(tempGitRepo.repoLocalPath);

    const isubo = new IsuboCore(params);
    const retArr = (await isubo.create(createParams));
    const lastRet = [];

    for (const ret of retArr) {
      const { title } = ret.data;
      const postpath = path.join(tempGitRepo.sourceDir, `${titleMaptoFilename[title] || title}.md`);
      const postParse = new PostParse({
        path: postpath,
        conf
      });

      const frontmatter = postParse.getFrontmatter();
      lastRet.push({
        ret,
        frontmatter
      });
    }

    // tempRepo.remove();
    process.chdir(precwd)

    return lastRet;
  };
}

export async function create_a_post_but_disable_push_assets () {
  const tempGitRepo = new TempGitRepo();
  await tempGitRepo.init({
    preConf(conf) {
      conf.push_asset = enumPushAssetType.DISABLE
    }
  });
  const {
    postpath
  } = tempGitRepo.addNewPostSync('license');

  const cwd = process.cwd();
  process.chdir(tempGitRepo.repoLocalPath);

  const isubo = new IsuboCore({
    cliParams: {
      filename: path.basename(postpath)
    },
    confPath: tempGitRepo.confPath,
    selectPosts: false,
  });
  const ret = (await isubo.create()).pop();
  process.chdir(cwd);
  return ret;
}

export const create_posts = createPostsFactory({
  filename: [
    'license',
    '$set和$del和方法的实现原理'
  ],
  titleMaptoFilename: {
    'LICENSE的选择与生成': 'license',
    '$set和$del和方法的实现原理': '$set和$del和方法的实现原理'
  }
});

export const create_posts_without_assets = createPostsFactory({
  filename: [
    '$set和$del和方法的实现原理'
  ],
  titleMaptoFilename: {
    '$set和$del和方法的实现原理': '$set和$del和方法的实现原理'
  }
});

export async function deploy_emit_err_by_hook() {
  const tempRepo = new TempRepo();
    tempRepo.copy((preConf) => ({
      ...preConf,
      source_dir: tempRepo.tempSourceDir,
      push_asset: enumPushAssetType.DISABLE
    }));
    const conf = tempRepo.conf;
    const filename = 'license';
    const isubo = new IsuboCore({
      selectPosts: false,
      conf,
      cliParams: { filename },
      hooks: {
        beforeDeploy: () => {
          throw new Error('Test');
        }
      }
    });
    
    try {
      await isubo.create();
    } catch (error) {
      
    }

    try {
      await isubo.update();
    } catch (error) {
      
    }

    try {
      await isubo.publish();
    } catch (error) {
      
    }
}

export async function update_one_post(cb) {
  const issue_number = 1;
  const tempRepo = new TempRepo();
  tempRepo.copy((preConf) => ({
    ...preConf,
    source_dir: tempRepo.tempSourceDir,
    push_asset: enumPushAssetType.DISABLE
  }));
  const conf = tempRepo.conf;
  // if(1) return console.info(conf)
  const postParse = new PostParse({
    path: path.join(tempRepo.tempSourceDir, 'license.md'),
    conf
  });
  postParse.injectFrontmatter({
    issue_number
  });
  const isubo = new IsuboCore({
    conf,
    cliParams: {
      filename: 'license'
    }
  });
  const ret = (await isubo.update()).pop();

  cb && cb(ret);

  return ret;
}

export async function write_to_clipboard() {
  const uniqueKey = getTimestampKey();
  const tempGitRepo = new TempGitRepo();
  await tempGitRepo.init({
    preConf(conf) {
      conf.source_statement.enable = false;
    }
  });
  const delStartEndLastLines = (s) => s.split('\n').slice(1, -1).join('\n');
  const ret = {
    repoLocalPath: tempGitRepo.repoLocalPath,
    postPath: path.join(tempGitRepo.sourceDir, `${uniqueKey}.md`),
    postDir: path.join(tempGitRepo.sourceDir, uniqueKey),
    srcPostContent: delStartEndLastLines(`
![](./license/Snipaste_2023-05-30_17-47-09.png)
    `),
    destPostContent: delStartEndLastLines(`
![](https://raw.githubusercontent.com/isaaxite/test-repo_deploy-posts-to-github-issue/master/source/license/Snipaste_2023-05-30_17-47-09.png)
    `),
    formatedPostContent: '',
  };
  
  ensureDirSync(ret.postDir);
  ensureFileSync(ret.postPath);

  writeFileSync(ret.postPath, ret.srcPostContent);

  const cwd = process.cwd();
  process.chdir(tempGitRepo.repoLocalPath);

  const isubo = new IsuboCore({
    cliParams: {
      filename: path.basename(ret.postPath)
    },
    confPath: tempGitRepo.confPath,
    selectPosts: false,
  });

  await isubo.writeToClipboard({ print: true });

  ret.formatedPostContent = clipboard.readSync().replace('\n', '');
  process.chdir(cwd);
  return ret;
}
