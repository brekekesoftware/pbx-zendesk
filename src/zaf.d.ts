interface CIFramework {
  setMode: (value: 0 | 1 | 2) => Promise<void>;
  setClickToAct: (value: boolean) => Promise<void>;
  addHandler: (name: string, handler: (payload: string) => void) => void;
  getEnvironment: () => Promise<string>;
  searchAndOpenRecords: (entity: string, queryParams: string, searchOnly: boolean, searchType?: 0 | 1) => Promise<string>;
  createRecord: (entity: string, data: string) => Promise<string>;
}

interface Microsoft {
  CIFramework: CIFramework;
}

export declare global {
  const Microsoft: Microsoft;
}
