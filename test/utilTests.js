/**
  Copyright (c) 2015, 2019, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
var env = process.env,
    assert = require('assert'),
    config = require('@oracle/oraclejet-tooling/lib/config'), 
    ojetUtil = require('@oracle/oraclejet-tooling/lib/util'), 
    _ = require('lodash');

describe("Config Test", function ()
{
  it("Util get file list", function(){
    const fileListSrc = [ { cwd: 'themes', src: [ 'alta/web/**/*pressed_selected.svg' ], dest: 'themes' } ];
    assert(_.isEqual(2, ojetUtil.getFileList('dev', fileListSrc).length));
  });

  it("Util get jet version", function(){
    const jetversion = ojetUtil.getJETVersion();
    assert(jetversion == require('@oracle/oraclejet-tooling/package.json').version);
  });

  it("Util get all themes", function(){
    config();
    config.loadOraclejetConfig('web');
    const themes = ojetUtil.getAllThemes();
    assert(themes.length == 0);
  });

  it("Util isCCaSassFile expect false", function(){
    assert(ojetUtil.isCcaSassFile('testApp/themes/alta/web/alta.css') === false);
  });

  it("Util isCCaSassFile expect true", function(){
    assert(ojetUtil.isCcaSassFile('jet-composites/mytheme.css') == true);
  });

  it("Util read path mapping", function(){
    config();
    config.loadOraclejetConfig('web');
    const map = ojetUtil.readPathMappingJson();
    assert(map.hasOwnProperty('cdns'));
    assert(map.hasOwnProperty('libs'));
    assert(map.use === 'local' || map.use === 'cdn');
  });

  it("Util get lib version", function(){
    const versions = ojetUtil.getLibVersionsObj();
    assert(versions.ojs === require('@oracle/oraclejet-tooling/package.json').version);
    assert(versions.ojL10n === versions.ojs);
    assert(versions.ojL10n === versions.ojtranslations);
    assert(versions.jquery === require('jquery/package.json').version);
  });
});

