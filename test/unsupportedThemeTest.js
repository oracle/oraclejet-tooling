/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const config = require('../lib/config');
const constants = require('../lib/constants');
const npmCopy = require('../lib/npmCopy');
const util = require('../lib/util');
const validations = require('../lib/validations');

describe('Unsupported theme removal', () => {
  const original = {};
  const unsupportedTheme = constants.UNSUPPORTED_THEMES[0];
  let tempDir;

  beforeEach(() => {
    original.cwd = process.cwd();
    original.configData = Object.assign({}, config.data);
    original.getOraclejetPath = util.getOraclejetPath;
    original.getInstalledCssPackage = util.getInstalledCssPackage;
    original.getLibVersionsObj = util.getLibVersionsObj;
    original.getFileList = util.getFileList;
    original.getJETVersion = util.getJETVersion;
    original.logError = util.log.error;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jet-cli-unsupported-theme-'));
    config.data = Object.assign({}, config.data, {
      defaultTheme: constants.DEFAULT_PCSS_THEME,
      paths: {
        src: {
          common: path.join(tempDir, 'src'),
          styles: 'css',
          javascript: 'js',
          typescript: 'ts',
          themes: 'themes',
          web: 'src-web'
        },
        staging: {
          web: path.join(tempDir, 'web'),
          themes: path.join(tempDir, 'staged-themes'),
          stagingPath: path.join(tempDir, 'web')
        },
        components: 'jet-composites',
        exchangeComponents: 'jet_components'
      }
    });
    util.getOraclejetPath = () => path.join(tempDir, 'node_modules', '@oracle', 'oraclejet', 'dist');
    util.getInstalledCssPackage = () => false;
    util.getLibVersionsObj = () => ({ ojs: '21.0.0' });
    util.getFileList = (buildType, fileList) => fileList;
    util.getJETVersion = () => '21.0.0';
  });

  afterEach(() => {
    process.chdir(original.cwd);
    config.data = original.configData;
    util.getOraclejetPath = original.getOraclejetPath;
    util.getInstalledCssPackage = original.getInstalledCssPackage;
    util.getLibVersionsObj = original.getLibVersionsObj;
    util.getFileList = original.getFileList;
    util.getJETVersion = original.getJETVersion;
    util.log.error = original.logError;
    fs.removeSync(tempDir);
  });

  it('should not stage unsupported theme distribution files when no CSS package is installed', () => {
    const fileList = npmCopy.getNonMappingFileList('dev');
    const serializedFileList = JSON.stringify(fileList);
    const unsupportedThemePattern =
      new RegExp(`[/\\\\](${unsupportedTheme}|${unsupportedTheme}-android|` +
        `${unsupportedTheme}-ios|${unsupportedTheme}-windows)([/\\\\]|$)`);
    const stagedUnsupportedThemePattern =
      new RegExp(`[/\\\\]staged-themes[/\\\\]${unsupportedTheme}([/\\\\]|$)`);
    const unsupportedThemeEntries = fileList.filter(entry =>
      unsupportedThemePattern.test(entry.cwd) ||
      stagedUnsupportedThemePattern.test(entry.dest));

    assert.deepStrictEqual(unsupportedThemeEntries, []);
    assert.strictEqual(serializedFileList.includes('Theme-redwood'), true, serializedFileList);
    assert.strictEqual(serializedFileList.includes('Theme-stable'), true, serializedFileList);
  });

  it('should stage stable distribution files when stable is the configured default theme', () => {
    config('defaultTheme', constants.DEFAULT_STABLE_THEME);

    const fileList = npmCopy.getNonMappingFileList('dev');
    const serializedFileList = JSON.stringify(fileList);

    assert.strictEqual(serializedFileList.includes('/dist/css/stable'), true, serializedFileList);
    assert.strictEqual(serializedFileList.includes('Theme-stable'), true, serializedFileList);
  });

  it('should not rename unsupported theme files in staging', () => {
    constants.SUPPORTED_PLATFORMS.forEach((platform) => {
      fs.outputFileSync(
        path.join(config('paths').staging.themes, unsupportedTheme, platform, `oj-${unsupportedTheme}.css`),
        ''
      );
      fs.outputFileSync(
        path.join(config('paths').staging.themes, unsupportedTheme, platform, `oj-${unsupportedTheme}-min.css`),
        ''
      );
    });
    fs.outputFileSync(path.join(config('paths').staging.themes, 'redwood', 'web', 'oj-redwood.css'), '');
    fs.outputFileSync(path.join(config('paths').staging.themes, 'redwood', 'web', 'oj-redwood-min.css'), '');
    fs.outputFileSync(path.join(config('paths').staging.themes, 'redwood', 'web', 'oj-redwood-notag.css'), '');
    fs.outputFileSync(path.join(config('paths').staging.themes, 'redwood', 'web', 'oj-redwood-notag-min.css'), '');
    fs.outputFileSync(path.join(config('paths').staging.themes, 'stable', 'web', 'oj-stable.css'), '');
    fs.outputFileSync(path.join(config('paths').staging.themes, 'stable', 'web', 'oj-stable-min.css'), '');

    npmCopy.renameThemeFiles(config('paths'));

    constants.SUPPORTED_PLATFORMS.forEach((platform) => {
      assert.strictEqual(
        fs.existsSync(
          path.join(config('paths').staging.themes, unsupportedTheme, platform, `oj-${unsupportedTheme}.css`)
        ),
        true
      );
      assert.strictEqual(
        fs.existsSync(path.join(config('paths').staging.themes, unsupportedTheme, platform, `${unsupportedTheme}.css`)),
        false
      );
    });
    assert.strictEqual(
      fs.existsSync(path.join(config('paths').staging.themes, 'redwood', 'web', 'redwood.css')),
      true
    );
    assert.strictEqual(
      fs.existsSync(path.join(config('paths').staging.themes, 'stable', 'web', 'stable.css')),
      true
    );
  });

  it('should rename stable theme files when stable is the configured default theme', () => {
    config('defaultTheme', constants.DEFAULT_STABLE_THEME);
    fs.outputFileSync(path.join(config('paths').staging.themes, 'stable', 'web', 'oj-stable.css'), '');
    fs.outputFileSync(path.join(config('paths').staging.themes, 'stable', 'web', 'oj-stable-min.css'), '');

    npmCopy.renameThemeFiles(config('paths'));

    assert.strictEqual(
      fs.existsSync(path.join(config('paths').staging.themes, 'stable', 'web', 'stable.css')),
      true
    );
    assert.strictEqual(
      fs.existsSync(path.join(config('paths').staging.themes, 'stable', 'web', 'stable.min.css')),
      true
    );
  });

  it('should expose bundled theme rename helper without legacy theme API names', () => {
    assert.strictEqual(typeof npmCopy.renameThemeFiles, 'function');
    assert.deepStrictEqual(
      Object.keys(npmCopy).filter(key => key !== 'renameThemeFiles' && /^rename.*ThemeFiles$/.test(key)),
      []
    );
  });

  it('should not expose the legacy source skin mapper', () => {
    const removedSkinMapper = ['mapTo', 'SourceSkinName'].join('');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(util, removedSkinMapper), false);
  });

  it('should exclude unsupported themes when expanding all themes for all platforms', () => {
    fs.outputFileSync(path.join(config('paths').src.common, config('paths').src.themes, 'demo', 'web', 'demo.css'), '');
    fs.outputFileSync(
      path.join(config('paths').src.common, config('paths').src.themes, unsupportedTheme, 'web', `oj-${unsupportedTheme}.css`),
      ''
    );
    const options = validations.theme({
      theme: 'redwood:web',
      themes: ['all:all']
    }, constants.SUPPORTED_WEB_PLATFORM);

    assert.deepStrictEqual(
      options.themes.map(theme => `${theme.name}:${theme.platform}`),
      ['demo:web']
    );
  });

  it('should reject explicit unsupported theme requests with a clear error', () => {
    util.log.error = (message) => {
      throw new Error(String(message));
    };

    assert.throws(
      () => validations.theme({ theme: `${unsupportedTheme}:web` }, constants.SUPPORTED_WEB_PLATFORM),
      /Theme .* is no longer supported/
    );
  });

  it('should default projects without a configured theme to redwood', () => {
    process.chdir(tempDir);

    config.getConfiguredPaths();

    assert.strictEqual(config('defaultTheme'), constants.DEFAULT_PCSS_THEME);
  });

  it('should not keep webpack unsupported theme copy or redirect hooks', () => {
    const filesToCheck = [
      path.join(__dirname, '..', 'lib', 'webpack', 'setup.js'),
      path.join(__dirname, '..', 'lib', 'webpack', 'utils.js'),
      path.join(__dirname, '..', 'lib', 'webpack', 'webpack.common.js'),
      path.join(__dirname, '..', 'lib', 'buildCommon', 'webpack.js')
    ];
    const legacyCopyHook =
      `copyRequired${unsupportedTheme[0].toUpperCase()}${unsupportedTheme.slice(1)}FilesToStaging`;

    filesToCheck.forEach((file) => {
      const fileContent = fs.readFileSync(file, 'utf8');
      assert.strictEqual(fileContent.includes(legacyCopyHook), false, file);
      assert.strictEqual(fileContent.includes(`../../../${unsupportedTheme}/`), false, file);
    });
  });
});
