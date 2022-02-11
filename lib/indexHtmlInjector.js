/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

/**
 * # Dependencies
 */


/* 3rd party */
const fs = require('fs-extra');

/* Node.js native */
// Temporarily replace parser with fixed one to handle ':' attributes
const DOMParser = require('./parser/dom-parser').DOMParser;
const path = require('path');

/* Oracle */
const platformPaths = require('./defaultconfig').platforms;
const injectorUtil = require('./injectorUtil');
const util = require('./util');
const endOfLine = require('os').EOL;
const config = require('./config');
const CONSTANTS = require('./constants');

/**
 * # Injector API
 *
 * @public
 */

/**
 * ## _scriptSrcExists
 *
 * @private
 * @param {object} documentDom
 * @param {string} scriptSrc
 * @returns {boolean}
 */

function _scriptSrcExists(documentDom, scriptSrc) {
  const scripts = documentDom.getElementsByTagName('script');
  return Array.from(scripts).some(script => script.getAttribute('src') === scriptSrc);
}

/**
 * ## _createScriptElement
 *
 * @private
 * @param {object} documentDom
 * @param {string} scriptSrc
 * @returns {object || null} scriptElement
 */

function _createScriptElement(documentDom, scriptSrc) {
  if (_scriptSrcExists(documentDom, scriptSrc)) {
    return null;
  }

  const scriptElement = documentDom.createElement('script');
  scriptElement.setAttribute('type', 'text/javascript');
  scriptElement.setAttribute('src', scriptSrc);
  return scriptElement;
}

/**
 * ## _getFirstJavaScriptElement
 *
 * @private
 * @param {string} documentDom
 * @returns {object || null} scriptElement
 */

function _getFirstJavaScriptElement(documentDom) {
  const scripts = documentDom.getElementsByTagName('script');
  return Array.from(scripts).find((script) => {
    const typeAttr = script.getAttribute('type');
    return (!typeAttr || (typeAttr === 'text/javascript'));
  });
}

/**
 * ## _injectScriptElement
 *
 * @private
 * @param {string} documentDom
 * @param {string} cordovaElement
 */

function _injectScriptElement(documentDom, cordovaElement) {
  let paddingElem;
  const firstScript = _getFirstJavaScriptElement(documentDom);

  // prepend to an existing script tag...
  if (firstScript) {
    documentDom.insertBefore(cordovaElement, firstScript);
    paddingElem = documentDom.createTextNode(`${endOfLine}    `);
    documentDom.insertBefore(paddingElem, firstScript);
  } else {
    // ... or append to the body
    const bodyElem = documentDom.getElementsByTagName('body')[0];
    bodyElem.appendChild(cordovaElement);
    paddingElem = documentDom.createTextNode(`${endOfLine}  `);
    bodyElem.appendChild(paddingElem);
  }
}

/**
 * # Private functions
 * ## _getInjectSourceContent
 *
 * @private
 * @param {boolean} updatePlatformFile
 * @param {string} platform
 * @returns {Object}
 */

function _getInjectSourceContent(updatePlatformFile, platform) {
  let indexHTML;

  if (updatePlatformFile) {
    const root = platformPaths[platform].root;
    indexHTML = path.resolve(root, 'index.html');
  } else {
    indexHTML = path.resolve(`${config('paths').staging.hybrid}/www/index.html`);
  }

  const document = util.readFileSync(indexHTML);
  const documentDom = new DOMParser().parseFromString(document, 'text/html');
  return { indexHTML, document, documentDom };
}

function _getStyleLinkBase(css, theme, buildType) {
  const masterJson = _isUseCdn(theme.name);
  const linkExt = util.getThemeCssExtention(buildType, masterJson !== null);

  if (masterJson !== null) {
    // CDN
    // Add -platform if non web and non redwood
    const platform = (theme.platform === 'web' || theme.name === 'redwood') ? '' : `-${theme.platform}`;
    return { created: `${masterJson.cdns.jet.css}/${theme.name}${platform}/oj-${theme.name}${linkExt}` };
  }

  const platform = (theme.name === 'redwood' || theme.name === 'stable') ? 'web' : theme.platform;
  if (theme.version) {
    if (theme.cssGeneratedType === 'add-on') {
      if (theme.basetheme === CONSTANTS.DEFAULT_STABLE_THEME) {
        return {
          default: `${css}/${CONSTANTS.DEFAULT_STABLE_THEME}/${util.getJETVersion()}/${platform}/${CONSTANTS.DEFAULT_STABLE_THEME}${linkExt}`,
          created: `${css}/${theme.name}/${theme.version}/${platform}/${theme.name}${linkExt}`
        };
      }
      return {
        default: `${css}/${CONSTANTS.DEFAULT_PCSS_THEME}/${util.getJETVersion()}/${platform}/${CONSTANTS.DEFAULT_PCSS_THEME}${linkExt}`,
        created: `${css}/${theme.name}/${theme.version}/${platform}/${theme.name}${linkExt}`
      };
    }
    if (theme.cssGeneratedType === 'combined' || theme.cssGeneratedType === '') {
      return {
        created: `${css}/${theme.name}/${theme.version}/${platform}/${theme.name}${linkExt}`
      };
    }
  }
  return {
    created: `${css}/${theme.name}/${platform}/${theme.name}${linkExt}`
  };
}

function _isUseCdn(name) {
  const masterJson = util.readPathMappingJson();
  if (masterJson.use === 'local' || !masterJson.cdns || !masterJson.cdns.jet || !masterJson.cdns.jet.config) {
    return null;
  }
  // Check for built in themes--cdn not supported otherwise
  if (name === undefined || name === 'redwood' || name === 'alta') {
    return masterJson;
  }
  return null;
}


function _getThemeStyleLink(theme, buildType) {
  const css = config('paths').src.styles;
  const linkBase = _getStyleLinkBase(css, theme, buildType);

  if (linkBase.default) {
    return `<link rel="stylesheet" href="${linkBase.default}" id="basestyles" />\n<link rel="stylesheet" href="${linkBase.created}" id="overridestyles" />`;
  }
  return `<link rel="stylesheet" href="${linkBase.created}" id="basestyles" />`;
}

function _getIndexHtml(indexHtml) {
  return util.readFileSync(indexHtml);
}

function _getCspMetaTag(documentDom) {
  const metas = documentDom.getElementsByTagName('meta');
  return Array.from(metas).find((meta) => {
    const contentAttr = meta.getAttribute('http-equiv');
    return (contentAttr === 'Content-Security-Policy');
  });
}

function _getRequireJavaScriptElement(documentDom) {
  const scripts = documentDom.getElementsByTagName('script');
  return Array.from(scripts).find((script) => {
    const typeAttr = script.getAttribute('type');
    const srcAttr = script.getAttribute('src');
    return ((!typeAttr || (typeAttr === 'text/javascript')) && /require/.test(srcAttr));
  });
}

function _createRequireScriptElementString(masterJson) {
  const configPaths = util.getConfiguredPaths();
  let scriptSrc;
  if (masterJson) {
    scriptSrc = `${masterJson.cdns['3rdparty']}/require/require.js`;
  } else {
    scriptSrc = `${configPaths.src.javascript}/libs/require/require.js`;
  }
  return injectorUtil.createScriptElementString(scriptSrc);
}

function _createCDNBundleScriptElementString(masterJson) {
  if (masterJson) {
    return injectorUtil.createScriptElementString(`${masterJson.cdns.jet.prefix}/${masterJson.cdns.jet.config}`);
  }
  return null;
}

function _createBundleScriptElementString() {
  const configPaths = util.getConfiguredPaths();
  const bundleName = util.getBundleName().full;
  return injectorUtil.createScriptElementString(`${configPaths.src.javascript}/${bundleName}`);
}

function _createMainSscriptElementString() {
  const configPaths = util.getConfiguredPaths();
  return injectorUtil.createScriptElementString(`${configPaths.src.javascript}/main.js`);
}

function _replaceTokenWithScripts({
  content,
  contentDest,
  pattern,
  startTag,
  endTag,
  masterJson,
  context
}) {
  let scriptStrings = '';
  const lineEnding = injectorUtil.getLineEnding(content);
  const bundleJsScriptElementString = _createBundleScriptElementString();
  if (context.opts.bundler === 'webpack') {
    // bundler is webpack, add bundle.js script
    scriptStrings += bundleJsScriptElementString;
  } else {
    // bundler is r.js, add require.js and main.js / bundle.js scripts
    const requireJsScriptElementString = _createRequireScriptElementString(masterJson);
    scriptStrings += `${requireJsScriptElementString}${lineEnding}`;
    // add bundle-config.js script if using CDN
    const cdnBundleScriptElemeentString = _createCDNBundleScriptElementString(masterJson);
    if (cdnBundleScriptElemeentString) {
      scriptStrings += `${cdnBundleScriptElemeentString}${lineEnding}`;
    }
    // add main.js script if debug build, bundle.js script if release
    const mainScriptElementString = _createMainSscriptElementString();
    scriptStrings += context.buildType === 'release' ? bundleJsScriptElementString : mainScriptElementString;
  }
  const injectResult = injectorUtil.replaceInjectorTokens({
    content,
    pattern,
    replace: scriptStrings,
    eol: lineEnding,
    startTag,
    endTag
  });
  util.writeFileSync(contentDest, injectResult);
}

function _injectCdnBundleScript({ content, contentDest, masterJson }) {
  const documentDom = new DOMParser().parseFromString(content, 'text/html');
  const scriptSrc = `${masterJson.cdns.jet.prefix}/${masterJson.cdns.jet.config}`;
  const cdnBundleElement = _createScriptElement(documentDom, scriptSrc);
  const requirejsElement = _getRequireJavaScriptElement(documentDom);
  if (cdnBundleElement && requirejsElement) {
    // append to an requirejs script tag...
    documentDom.insertBefore(cdnBundleElement, requirejsElement.nextSibling);
    const paddingElem = documentDom.createTextNode(`${endOfLine}    `);
    documentDom.insertBefore(paddingElem, requirejsElement.nextSibling);
    util.writeFileSync(contentDest, documentDom.toString());
  }
}

module.exports =
{
  injectHybridScriptTags: (context) => {
    const updatePlatformFile = context.updatePlatformFile;
    const platform = context.platform;
    const destination = context.opts.destination;

    const injectSourceContent = _getInjectSourceContent(updatePlatformFile, platform);
    const indexHTML = injectSourceContent.indexHTML;
    const documentDom = injectSourceContent.documentDom;

    let write = false;
    if (destination === 'browser' || destination === 'server-only') {
      const mockElement = _createScriptElement(documentDom, `${config('paths').src.javascript}/cordovaMocks.js`);
      if (mockElement) {
        _injectScriptElement(documentDom, mockElement);
      }
      write = true;
    }

    const cordovaElement = _createScriptElement(documentDom, 'cordova.js');
    if (cordovaElement) {
      _injectScriptElement(documentDom, cordovaElement);

      write = true;
    }

    if (write) {
      util.writeFileSync(indexHTML, documentDom.toString());
    }

    return context;
  },

  injectThemePath: (context) => {
    const opts = context.opts;
    const buildType = context.buildType;
    const stagingPath = opts.stagingPath;
    // read from staging index.html, update value, and write back to staging index.html
    const indexHtmlDestPath = util.destPath(path.resolve(stagingPath, 'index.html'));
    const indexHtmlContent = _getIndexHtml(indexHtmlDestPath);

    const startTag = opts.injectTheme.startTag;
    const endTag = opts.injectTheme.endTag;

    const theme = opts.theme;
    const themeStyleLinkString = _getThemeStyleLink(theme, buildType);

    const injectResult = injectorUtil.replaceInjectorTokens({
      content: indexHtmlContent,
      pattern: injectorUtil.getInjectorTagsRegExp(startTag, endTag),
      replace: themeStyleLinkString,
      eol: injectorUtil.getLineEnding(indexHtmlContent),
      startTag,
      endTag
    });

    fs.outputFileSync(indexHtmlDestPath, injectResult);
    return Promise.resolve(context);
  },

  injectLocalhostCspRule: (context) => {
    const opts = context.opts;
    const stagingPath = opts.stagingPath;
    const indexHtmlDestPath = util.destPath(path.resolve(stagingPath, 'index.html'));
    const indexHtmlContent = _getIndexHtml(indexHtmlDestPath);
    const documentDom = new DOMParser().parseFromString(indexHtmlContent, 'text/html');

    const cspMetaTag = _getCspMetaTag(documentDom);

    if (cspMetaTag && cspMetaTag !== null) {
      let contentAttrValue = cspMetaTag.getAttribute('content');

      const pattern = new RegExp('script-src([^;]*)', 'gi');
      const result = pattern.exec(contentAttrValue);
      let scriptSrc;
      let newScriptSrc;
      const cspRule = 'localhost:* 127.0.0.1:*';

      if (result) {
        scriptSrc = result[0];
        newScriptSrc = `${scriptSrc} ${cspRule}`;
        contentAttrValue = contentAttrValue.replace(scriptSrc, newScriptSrc);
      } else {
        newScriptSrc = `; script-src ${cspRule}`;
        contentAttrValue += newScriptSrc;
      }
      cspMetaTag.setAttribute('content', contentAttrValue);
      util.writeFileSync(indexHtmlDestPath, documentDom.toString());
    }
    return Promise.resolve(context);
  },

  injectScripts: (context) => {
    const opts = context.opts;
    const stagingPath = opts.stagingPath;
    const indexHtmlDestPath = util.destPath(path.join(stagingPath, 'index.html'));
    const indexHtmlContent = _getIndexHtml(indexHtmlDestPath);
    const masterJson = _isUseCdn();
    const { startTag, endTag } = opts.injectScripts;
    const pattern = injectorUtil.getInjectorTagsRegExp(startTag, endTag);
    if (pattern.test(indexHtmlContent)) {
      // index.html has injector:scripts token
      _replaceTokenWithScripts({
        content: indexHtmlContent,
        contentDest: indexHtmlDestPath,
        pattern,
        startTag,
        endTag,
        masterJson,
        context
      });
    } else if (masterJson) {
      // index.html does not have injector:scripts token, inject cdn bundle
      // script right after requirejs script
      _injectCdnBundleScript({
        content: indexHtmlContent,
        contentDest: indexHtmlDestPath,
        masterJson
      });
    }
    return Promise.resolve(context);
  }
};
