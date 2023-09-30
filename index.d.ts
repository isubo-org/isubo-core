declare enum enumDeployType {
  DISABLE = 'disable',
  PROMPT = 'prompt',
  AUTO = 'auto',
  IDLE = 'prompt',
}

declare interface CommonHint {
  start?: (type: enumDeployType, filepath: string) => void;
  succ?: (filepath: string) => void;
  fail?: (type: enumDeployType, filepath: string, opts: {
    errMsg: String;
    postTitle: String;
  }) => void;
}

declare interface PublishHint extends CommonHint {
  startUpdate?: (type: enumDeployType, filepath: String) => void;
  err?: (errMsg: String) => void;
}

declare interface DeployMethodCommonParam {
  filepathArr: Array<String>;
  hint: CommonHint;
}

declare type CreateParam0 = DeployMethodCommonParam;

declare type UpdateParam0 = DeployMethodCommonParam;

declare interface PublishParam0 extends DeployMethodCommonParam {
  hint: PublishHint;
}

export declare class IsuboCore {
  create(param0: CreateParam0): Promise<Array<void>>;
  update(param0: UpdateParam0): Promise<Array<void>>;
  publish(param0: PublishParam0): Promise<Array<void>>;
  writeToClipboardOneBy(param0: { filepathArr: String[] }): Promise<Array<void>>;
}
