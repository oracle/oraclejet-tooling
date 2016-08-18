/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * Jet after_prepare hook.
 * Please do not modify.
 * In case you need some after_prepare functionality, please follow Cordova documentation and create another hook.
 */

/**
 * # Dependencies
 */

/* Node.js native */
const fs = require("fs");
const path = require('path');

/* Constants */
const LOCAL_IP_ADDRESS = "127.0.0.1";
const ANDROID_LOCAL_IP_ADDRESS = "10.0.2.2";
const LOAD_URL_TIMEOUT_VALUE = "loadUrlTimeoutValue";

/**
 * # After prepare hook injector API
 *
 * @public
 */

module.exports =
{
  /**
   * ## updateIndexHtml
   * Updates index.html
   *
   * @public
   * @param {string} platform
   * @param {boolean} external
   */

  updateIndexHtml: function(platform, external)
  {
    var indexHtmlPath = _getIndexHtmlPath(platform, external);
    var content;

    if (!indexHtmlPath)
    {
      return;
    }

    try
    {
      content = fs.readFileSync(indexHtmlPath, "utf-8");

      content = _addPlatformStyleClasses(content, platform);
      if (_isLiveReloadEnabled())
      {
        content = _updateCspForLiveReload(content, platform);
        content = _addLiveReloadElement(content, platform);
      }
      fs.writeFileSync(indexHtmlPath, content);
    }
    catch (e)
    {
      console.log('Error:' + e)
    }
  },

  /**
   * ## updateConfigXml
   * Updates config.xml
   *
   * @public
   * @param {string} platform
   */

  updateConfigXml: function(platform)
  {
    var document;
    var configXml = _getConfigXmlPath(platform);
    if (!configXml)
    {
      return;
    }

    try
    {
      document = fs.readFileSync(configXml, "utf-8");
      if (_isLiveReloadEnabled())
      {
        if (process.env["platform"] && process.env["port"] && process.env["destination"]) {
          document = _processConfigSrcAttribute(document);
          document = _addNavigationPermission(document);
        }
      }
      document = _addLoadUrlTimeoutPreference(document);
      fs.writeFileSync(configXml, document);
    }
    catch (e)
    {
      console.log('Error:' + e);
      return;
    }
  }
};

/**
 * # Private functions
 * ## _getIndexHtmlPath
 *
 * @private
 * @param {string} platform
 * @param {boolean} external
 * @returns {string || null} indexHtmlPath
 */

function _getIndexHtmlPath(platform, external)
{
  var indexHtmlPath;
  var root;
  var prefix = external ? process.env['cordovaDirectory'] + '/' : "";

  if (platform === "android")
  {
    root = prefix + "platforms/android/assets/www/";
  }
  else if (platform === "ios")
  {
    root = prefix + "platforms/ios/www/";
  }
  else if (platform === "windows")
  {
    root = prefix + "platforms/windows/www/";
  }
  else if (platform === "browser")
  {
    root = prefix + "platforms/browser/www/";
  }
  else {
    return null;
  }

  if (root)
  {
    indexHtmlPath = path.resolve(root, "index.html");
  }

  return indexHtmlPath;
}

/**
 * ## _addPlatformStyleClasses
 * Adds platform specific css classes
 *
 * @private
 * @param {string} content      - Original content
 * @param {string} platform
 * @returns {string} newContent - Updated content
 */

function _addPlatformStyleClasses(content, platform)
{
  var bodyTag;
  var classAttrValue;
  var newBodyTag;
  var newContent = content;
  var classesToAdd = ['oj-hybrid', 'oj-platform-cordova'];
  
  // if serving in the browser, pick up the actual platform from env
  if (platform === 'browser')
  {
    platform = process.env['platform'];
  }

  bodyTag = _getXmlTag(content, 'body');
  if (bodyTag)
  {
    classAttrValue = _getXmlAttrValue(bodyTag, 'class') || '';
    classesToAdd.push('oj-platform-' + platform);

    if (platform === 'ios')
    {
      classesToAdd.push('oj-hybrid-statusbar-spacer');
    }
    
    classAttrValue = _addPlatformStyleClassesIfMissing(classAttrValue, classesToAdd);
    
    newBodyTag = _setXmlAttrValue(bodyTag, 'class', classAttrValue);
    newContent = content.replace(bodyTag, newBodyTag);
  }
  return newContent;
}

/**
 * ## _addPlatformStyleClassIfMissing
 * appends a new marker class to the provided class attribute value
 * 
 * @param {string} classStr            - original class attribute value
 * @param {Array|string} classesToAdd  - new marker class to be added
 * @returns {string}                   - an updated class attribute value
 */
function _addPlatformStyleClassesIfMissing(classStr, classesToAdd)
{
  var classes = (classesToAdd instanceof Array) ? classesToAdd : [ classesToAdd ];
  
  for (var i = 0; i < classes.length; i++)
  {
    if (classStr.indexOf(classes[i]) < 0)
    {
      if (classStr.length > 0)
      {
        classStr += ' ';
      }
      classStr += classes[i];
    }
  }
  return classStr;
}

/**
 * ## _addLiveReloadElement
 * Adds script tag for loading livereload
 *
 * @private
 * @param {string} content      - Original content
 * @param {string} platform
 * @returns {string} newContent - Updated content
 */

function _addLiveReloadElement(content, platform)
{
  var newContent = content;
  var liveReloadPort = process.env["livereloadPort"] || 35729;
  var destination = process.env["destination"];

  var liveReloadSrc = '';
  if (destination === 'browser')
  {
    liveReloadSrc = "http://localhost:" + liveReloadPort + "/livereload.js";
  }
  else
  {
    liveReloadSrc = "http://" + _getLocalIpAddress(platform) + ":" + liveReloadPort + "/livereload.js";
  }
  
  var scriptTag = '<script type="text/javascript" src="' + liveReloadSrc + '"></script>';

  newContent = content.replace("</body>", "  " + scriptTag + "\n  </body>");
  return newContent;
}

/**
 * ## injectCspRule
 * Injects Content Security Policy tag with required rules
 *
 * @private
 * @param {string} content   - original content
 * @param {string} cspRule   - Content Security Policy rules
 * @returns {string} content - updated content
 */

function _injectCspRule(content, cspRule)
{
  var newContent = content;
  var newCspTag;
  var scriptSrc;
  var newScriptSrc;
  var cspTag = _getXmlTagWithAttrValue(content, "meta", "http-equiv", "Content-Security-Policy");

  if (!cspTag)
  {
    // CSP meta tag not found, do nothing
    return content;
  }
  var contentAttrValue = _getXmlAttrValue(cspTag, "content");
  if (!contentAttrValue)
  {
    // no content attribute, do nothing
    return content;
  }
  var pattern = new RegExp('script-src([^;]*)', 'gi');
  var result = pattern.exec(contentAttrValue);
  if (result)
  {
    scriptSrc = result[0];
    newScriptSrc = scriptSrc + " " + cspRule;
    contentAttrValue = contentAttrValue.replace(scriptSrc, newScriptSrc);
  }
  else
  {
    newScriptSrc = "; script-src " + cspRule;
    contentAttrValue += newScriptSrc;
  }
  newCspTag = _setXmlAttrValue(cspTag, "content", contentAttrValue);
  newContent = content.replace(cspTag, newCspTag);

  return newContent;
}

/**
 * ## _updateCspForLiveReload
 * Updates Content Security Policy for livereload
 *
 * @private
 * @param {string} content      - Original content
 * @param {string} platform
 * @returns {string} newContent - Updated content
 */

function _updateCspForLiveReload(content, platform)
{
  var newContent = content;
  var liveReloadPort = process.env["livereloadPort"];
  var destination = process.env["destination"];
  
  var liveReloadSrc = '';
  
  if (destination === 'browser')
  {
    liveReloadSrc = "http://localhost:" + liveReloadPort;
  }
  else
  {
    liveReloadSrc = "http://" + _getLocalIpAddress(platform) + ":" + liveReloadPort;
  }

  newContent = _injectCspRule(content, liveReloadSrc);

  return newContent;
}

/**
 * ## _getConfigXmlPath
 *
 * @private
 * @param {string} platform
 * @returns {string || null}
 */

function _getConfigXmlPath(platform)
{
  var configXmlPath;

  if (platform === "android")
  {
    configXmlPath = "platforms/android/res/xml";
  }
  else if (platform === "ios")
  {
    configXmlPath = "platforms/ios/" + _getAppName();
  }
  else if (platform === "windows")
  {
    configXmlPath = "platforms/windows";
  }
  else if (platform === "browser")
  {
    configXmlPath = "platforms/browser";
  }
  else
  {
    return null;
  }

  return path.resolve(configXmlPath, "config.xml");
}

/**
 * ## _getAppName
 * Gets application name
 *
 * @private
 * @returns {string} name - Application name
 */

function _getAppName()
{
  var configXml = path.resolve("config.xml");
  var document = fs.readFileSync(configXml, "utf-8");
  var name = _getXmlNodeText(document, "name");

  return name;
}

/**
 * ## _processConfigSrcAttribute
 * Adds src tag to config.xml
 *
 * @private
 * @param {string} document      - Original content
 * @returns {string} newDocument - Updated content
 */

function _processConfigSrcAttribute(document)
{
  var newDocument = document;

  // need to update the config src for livereloading
  var platform = process.env["platform"];
  var destination = process.env["destination"];
  var serverPort = process.env["port"];
  var newSrcValue = '';

  // due to how emulator/devices work; localhost does not point to your
  // laptop and etc but its internal one, need to use ip address
  if (destination === 'browser')
  {
    newSrcValue = "http://localhost:" + serverPort + "/browser/www/index.html";
  }
  else
  {
    newSrcValue = "http://" + _getLocalIpAddress(platform) + ":" + serverPort + "/" + platform + "/www/index.html";
  }

  var contentTag = _getXmlTag(document, "content");
  var newContentTag = _setXmlAttrValue(contentTag, "src", newSrcValue);

  newDocument = document.replace(contentTag, newContentTag);
  return newDocument;
}

/**
 * ## _addLoadUrlTimeoutPreference
 *
 * @private
 * @param {string} document      - Original content
 * @returns {string} newDocument - Updated content
 */

function _addLoadUrlTimeoutPreference(document)
{
  var newDocument = document;
  var newPreferenceTag;
  var contentTag;
  var preferenceTag = _getXmlTagWithAttrValue(document, "preference", "name", LOAD_URL_TIMEOUT_VALUE);

  if (preferenceTag)
  {
    newPreferenceTag = _setXmlAttrValue(preferenceTag, "value", "700000");
    newDocument = document.replace(preferenceTag, newPreferenceTag);
  }
  else
  {
    // loadUrlTimeoutValue preference tag does not exist yet, 
    // append it after the content tag
    contentTag = _getXmlTag(document, "content");
    if (contentTag)
    {
      newPreferenceTag = contentTag + '\n    <preference name="' + LOAD_URL_TIMEOUT_VALUE + '" value="700000" />';
      newDocument = document.replace(contentTag, newPreferenceTag);
    }
  }

  return newDocument;
}

/**
 * ## _addNavigationPermission
 *
 * @private
 * @param {string} document      - Original content
 * @returns {string} newDocument - Updated content
 */

function _addNavigationPermission(document)
{
  // need to update the config src for livereloading
  var newDocument = document;
  var platform = process.env["platform"];
  var contentTag = _getXmlTag(document, "content");

  if (contentTag)
  {
    var newAllowTag = contentTag + '\n    <allow-navigation href="http://' + _getLocalIpAddress(platform) + '/*" />';
    newDocument = document.replace(contentTag, newAllowTag);
  }

  return newDocument;
}

/**
 * ## _isLiveReloadEnabled
 *
 * @private
 * @returns {boolean}
 */

function _isLiveReloadEnabled()
{
  var liveReloadEnabled = process.env["livereload"];
  return (liveReloadEnabled !== "false" && liveReloadEnabled !== undefined);
}

/**
 * ## _getLocalIpAddress
 *
 * @private
 * @param {string} platform
 * @returns {string}        - IP address
 */

function _getLocalIpAddress(platform)
{
  return (platform === "android") ? ANDROID_LOCAL_IP_ADDRESS : LOCAL_IP_ADDRESS;
}

/**
 * ## _getXmlTag
 *
 * @private
 * @param {string} content
 * @param {string} tagName
 * @returns {string} tag
 */

function _getXmlTag(content, tagName)
{
  var tag;
  var pattern = new RegExp('<' + tagName + '([\\s\\S]*?)>', 'gi');
  var result = pattern.exec(content);
  if (result)
  {
    tag = result[0];
  }

  return tag;
}

/**
 * ## _getXmlAttrValue
 *
 * @private
 * @param {string} tag         - Tag
 * @param {string} attr        - Attribute
 * @returns {string} attrValue - Attribute value
 */

function _getXmlAttrValue(tag, attr)
{
  var attrValue;
  var pattern = new RegExp(attr + '=["](.*?)["]', 'gi');
  var result = pattern.exec(tag);
  if (result && result[1])
  {
    attrValue = result[1];
  }

  return attrValue;
}

/**
 * ## _setXmlAttrValue
 *
 * @private
 * @param {string} tag
 * @param {string} attr
 * @param {string} value
 * @returns {string} newTag
 */

function _setXmlAttrValue(tag, attr, value)
{
  var newTag;
  var newAttr;
  var pattern = new RegExp(attr + '=["](.*?)["]', 'gi');
  var result = pattern.exec(tag);
  if (result)
  {
    newAttr = result[0].replace(result[1], value);
    newTag = tag.replace(result[0], newAttr);
  }
  else
  {
    // add new attribute at the end, assume tag ends with '>'
    newTag = tag.substr(0, tag.length - 1) + ' ' + attr + '="' + value + '">';
  }

  return newTag;
}

/**
 * ## _getXmlNodeText
 *
 * @private
 * @param {string} content
 * @param {string} tag
 * @returns {string} text
 */

function _getXmlNodeText(content, tag)
{
  var text;
  var pattern = new RegExp('<' + tag + '([\\s\\S]*?)>(.*?)<\\/' + tag + '>', 'gi');
  var result = pattern.exec(content);
  if (result)
  {
    text = result[2];
  }

  return text;
}

/**
 * ## _getXmlTagWithAttrValue
 *
 * @private
 * @param {string} content
 * @param {string} tagName
 * @param {string} attr
 * @param {string} value
 * @returns {string || null} tag
 */

function _getXmlTagWithAttrValue(content, tagName, attr, value)
{
  var tag;
  var attrValue;
  var result;
  var pattern = new RegExp('<' + tagName + '([\\s\\S]*?)>', 'gi');

  do
  {
    result = pattern.exec(content);
    if (result)
    {
      tag = result[0];
      attrValue = _getXmlAttrValue(tag, attr);
      if (attrValue && attrValue == value)
      {
        return tag;
      }
    }
  } while (result);

  return null;
}
