export declare const ICON_SIZES: number[];
export declare const EXTENSION_CSP: string;
export declare const FIREFOX_ID: string;
export declare const FIREFOX_OPTIONAL_DATA: string[];

interface CommonManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  icons: Record<string, string>;
  action: { default_title: string; default_icon: Record<string, string> };
  permissions: string[];
  content_security_policy: { extension_pages: string };
}

export interface ChromeManifest extends CommonManifest {
  background: { service_worker: string };
  minimum_chrome_version: string;
}

export interface FirefoxManifest extends CommonManifest {
  background: { scripts: string[] };
  browser_specific_settings: {
    gecko: {
      id: string;
      strict_min_version: string;
      data_collection_permissions: { required: string[]; optional: string[] };
    };
  };
}

export declare function extensionManifest(version: string, browser?: 'chrome'): ChromeManifest;
export declare function extensionManifest(version: string, browser: 'firefox'): FirefoxManifest;
