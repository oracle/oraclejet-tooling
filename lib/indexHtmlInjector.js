/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';
/**
 * # Dependencies
 */

/* 3rd party */
const fs = require('fs-extra');

/* Node.js native */
const DOMParser = require('xmldom').DOMParser;
const path = require('path');

/* Oracle */
const CONSTANTS = require('./constants');
const platformPaths = require('./defaultconfig').platforms;
const injectorUtil = require('./injectorUtil');
const util = require('./util');
const endOfLine = require('os').EOL;
const config = require('./config');

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
  for (let i = 0, len = scripts.length; i < len; i++) {
    if (scripts[i].getAttribute('src') === scriptSrc) {
      return true;
    }
  }
  return false;
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

  let scriptElement = documentDom.createElement('script');
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

function _getFirstJavaScriptElement(documentDom)
{
  let scripts = documentDom.getElementsByTagName('script');
  
  for (let i = 0; i < scripts.length; i++)
  {
    let typeAttr = scripts[i].getAttribute('type');
    if (!typeAttr || typeAttr === 'text/javascript')
    {
      return scripts[i];
    }
  }
  return null;
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
  let firstScript = _getFirstJavaScriptElement(documentDom);
  
  // prepend to an existing script tag...
  if (firstScript)
  {
    documentDom.insertBefore(cordovaElement, firstScript);
    paddingElem = documentDom.createTextNode(endOfLine + '    ');
    documentDom.insertBefore(paddingElem, firstScript);
  }
  else          // ... or append to the body
  {
    let bodyElem = documentDom.getElementsByTagName('body')[0];
    bodyElem.appendChild(cordovaElement);
    paddingElem = documentDom.createTextNode(endOfLine + '  ');
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
    indexHTML = path.resolve(config("paths").staging.hybrid + '/www/index.html');
  }

  const document = fs.readFileSync(indexHTML, 'utf-8');
  const documentDom = new DOMParser().parseFromString(document, 'text/html');
  return { indexHTML, document, documentDom };
}

function _getThemeStyleLink(theme, buildType) {
  let linkExt = util.getThemeCssExtention(buildType);
  let css = config("paths").src.styles;
  let linkBase = (theme.version) ? 
      `${css}/${theme.name}/${theme.version}/${theme.platform}/${theme.name}${linkExt}`: 
      `${css}/${theme.name}/${theme.platform}/${theme.name}${linkExt}`;
  
  return `<link rel="stylesheet" href="${linkBase}" id="css" />`;
}

function _getIndexHtml(indexHtml) {  
  return fs.readFileSync(indexHtml, 'utf-8');
}

function _getCspMetaTag(documentDom)
{
  let metas = documentDom.getElementsByTagName('meta');
  
  for (let i = 0; i < metas.length; i++)
  {
    let contentAttr = metas[i].getAttribute('http-equiv');
    if (contentAttr === 'Content-Security-Policy')
      return metas[i];
  }
  return null;
}

module.exports =
{
  injectScriptTags: (context) => {
    const updatePlatformFile = context.updatePlatformFile;
    const platform = context.platform;
    const destination = context.opts.destination;

    const injectSourceContent = _getInjectSourceContent(updatePlatformFile, platform);
    const indexHTML = injectSourceContent.indexHTML;
    const documentDom = injectSourceContent.documentDom;

    let write = false;
    if (destination === 'browser' || destination === 'server-only') 
    {
      const mockElement = _createScriptElement(documentDom, `${config("paths").src.javascript}/cordovaMocks.js`);
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
      fs.writeFileSync(indexHTML, documentDom);  
    }
    
    return context;
  },

  injectThemePath: (context) => {
    const opts = context.opts;
    const buildType = context.buildType;
    const stagingPath = opts.stagingPath;
    // read from staging index.html, update value, and write back to staging index.html
    let indexHtmlDestPath = util.destPath(path.resolve(stagingPath, 'index.html'));
    let indexHtmlContent = _getIndexHtml(indexHtmlDestPath);

    const startTag = opts.injectTheme.startTag;
    const endTag = opts.injectTheme.endTag;
    const pattern = injectorUtil.getInjectorTagsRegExp(startTag, endTag);
    const lineEnding = /\r\n/.test(String(indexHtmlContent)) ? '\r\n' : '\n';

    const theme = opts.theme;
    let themeStyleLink = _getThemeStyleLink(theme, buildType);
    //two step process to help regex performance

    //remove the existing stylelink
    let injectResult = indexHtmlContent.replace(pattern, () =>
      startTag + lineEnding + endTag
    );
    //actual injection of the theme style link
    injectResult = injectResult.replace(pattern, () =>
     startTag + lineEnding + themeStyleLink + lineEnding + endTag
    );
    fs.outputFileSync(indexHtmlDestPath, injectResult);  
    return Promise.resolve(context);
  },
  
  injectLocalhostCspRule: (context) => {
    const opts = context.opts;
    const stagingPath = opts.stagingPath;
    const indexHtmlDestPath = util.destPath(path.resolve(stagingPath, 'index.html'));
    const indexHtmlContent = _getIndexHtml(indexHtmlDestPath);
    const documentDom = new DOMParser().parseFromString(indexHtmlContent, 'text/html');
    
    let cspMetaTag = _getCspMetaTag(documentDom);
    
    if (cspMetaTag !== null)
    {
      let contentAttrValue = cspMetaTag.getAttribute('content');

      const pattern = new RegExp('script-src([^;]*)', 'gi');
      let result = pattern.exec(contentAttrValue);
      let scriptSrc;
      let newScriptSrc;
      const cspRule = 'localhost:* 127.0.0.1:*';

      if (result)
      {
        scriptSrc = result[0];
        newScriptSrc = scriptSrc + ' ' + cspRule;
        contentAttrValue = contentAttrValue.replace(scriptSrc, newScriptSrc);
      }
      else
      {
        newScriptSrc = "; script-src " + cspRule;
        contentAttrValue += newScriptSrc;
      }
      cspMetaTag.setAttribute('content', contentAttrValue);
      fs.writeFileSync(indexHtmlDestPath, documentDom);  
    }
    return Promise.resolve(context);    
  }
};
