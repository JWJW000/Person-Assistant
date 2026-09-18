import { describe, it, expect } from 'vitest';
import { isNewer } from './updater';

describe('isNewer', () => {
  it('detects semver upgrade even when versionCode is missing', () => {
    expect(
      isNewer(
        { version: '0.9.1', url: 'https://example.com/app.apk' },
        { versionName: '0.9.0', versionCode: 9000, packageName: 'com.assistant.app', canInstallPackages: true }
      )
    ).toBe(true);
  });

  it('detects versionCode upgrade', () => {
    expect(
      isNewer(
        { version: '0.9.1', versionCode: 9001, url: 'https://example.com/app.apk' },
        { versionName: '0.9.0', versionCode: 9000, packageName: 'com.assistant.app', canInstallPackages: true }
      )
    ).toBe(true);
  });

  it('offers update when local version cannot be read', () => {
    expect(isNewer({ version: '0.9.1', versionCode: 9001, url: 'https://example.com/app.apk' }, null)).toBe(true);
  });

  it('treats equal versions as up to date', () => {
    expect(
      isNewer(
        { version: '0.9.1', versionCode: 9001, url: 'https://example.com/app.apk' },
        { versionName: '0.9.1', versionCode: 9001, packageName: 'com.assistant.app', canInstallPackages: true }
      )
    ).toBe(false);
  });
});
