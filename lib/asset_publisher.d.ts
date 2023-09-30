export declare class AssetPublisherDefHinter {
  setSimpleGitOptAndBaseDir(): {
    errParam: void;
  }

  execRecoverTasks(): {
    start(hintKey: String, hintTxt: String): void;
    succ(hintKey: String): void;
    fail(hintKey: String): void;
  }

  pushPostAndAssets(): {
    start(cmd: String): void;
    end(): void;
  }

  push(): {
    cleanTip(): void;
    unpushPaths(): void;
    err(errMsg: String): void;
  }

  commitPostAndAssets(): {
    start(hintKey: String): void;
    succ(hintKey: String): void;
    fail(hintKey: String): void;
  }

  backupPrevStaged(): {
    start(hintKey: String): void;
    succ(hintKey: String): void;
    fail(hintKey: String): void;
  }

  recoverAsSucPush(): {
    start(hintKey: String): void;
    succ(hintKey: String): void;
    fail(hintKey: String): void;
  }
}

export declare class AssetPublisher {
  static injectHint(extHintIns:AssetPublisherDefHinter ): void;
}
