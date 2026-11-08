export declare const ICON_SIZES: number[];
export declare const EXTENSION_CSP: string;
export declare function extensionManifest(version: string): {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  icons: Record<string, string>;
  action: { default_title: string; default_icon: Record<string, string> };
  background: { service_worker: string };
  permissions: string[];
  content_security_policy: { extension_pages: string };
  minimum_chrome_version: string;
};
