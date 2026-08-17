/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');

const config = require('../lib/config');
const util = require('../lib/util');
const watch = require('../lib/serve/watch');

describe('RegExp hardening', () => {
  let originalConfigData;

  beforeEach(() => {
    originalConfigData = config.data;
    config.data = {};
  });

  afterEach(() => {
    config.data = originalConfigData;
  });

  it('should escape regex metacharacters for literal matching', () => {
    const escaped = util.escapeForRegExp('src.web/(a+)+$');
    const regex = new RegExp(escaped);

    assert.strictEqual(regex.test('src.web/(a+)+$'), true);
    assert.strictEqual(regex.test('srcXweb/aaaa'), false);
  });

  it('should treat component paths as literal strings in isCcaSassFile', () => {
    config.set('paths', _getPaths({
      components: 'jet.components'
    }));

    assert.strictEqual(util.isCcaSassFile('jet.components/mytheme.scss'), true);
    assert.strictEqual(util.isCcaSassFile('jetXcomponents/mytheme.scss'), false);
  });

  it('should treat source path mapping prefixes as literal strings', () => {
    config.set('paths', _getPaths({
      src: {
        common: 'src.web'
      }
    }));

    const result = util.pointTypescriptPathMappingsToStaging({
      context: {
        opts: {
          stagingPath: 'web'
        }
      },
      pathMappings: {
        app: ['./src.web/js/app', './srcXweb/js/app']
      }
    });

    assert.deepStrictEqual(result.app, ['./web/js/app', './srcXweb/js/app']);
  });

  it('should treat watch path config as literal strings', () => {
    config.set('paths', _getPaths({
      src: {
        common: 'src.common',
        themes: 'src.themes'
      },
      staging: {
        themes: 'staged.themes'
      }
    }));

    assert.strictEqual(watch.__isThemeFile('src.themes/theme.txt'), true);
    assert.strictEqual(watch.__isThemeFile('srcXthemes/theme.txt'), false);
    assert.strictEqual(watch.__isThemeFile('staged.themes/theme.txt'), true);
    assert.strictEqual(watch.__isThemeFile('stagedXthemes/theme.txt'), false);
    assert.strictEqual(watch.__isThemeFile('srcXcommon/styles/app.css'), true);
  });
});

function _getPaths(overrides) {
  return {
    src: Object.assign({
      common: 'src',
      themes: 'themes'
    }, overrides.src || {}),
    staging: Object.assign({
      web: 'web',
      themes: 'staged-themes'
    }, overrides.staging || {}),
    components: overrides.components || 'jet-composites',
    exchangeComponents: 'jet_components'
  };
}
