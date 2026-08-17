/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

/**
 * # Dependencies
 */

/* 3rd party */
const express = require('express');
const serveStatic = require('serve-static');
const serveIndex = require('serve-index');
const http = require('http');
const injectLiveReload = require('connect-livereload');
const open = require('open');

const utils = require('../util');

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '::1'];

/**
 * # serve Connect Module
 *
 * @public
 */
module.exports = function (opts, context) {
  utils.log('Starting web server.');
  const connectOpts = _processCustomOptions(opts);
  return new Promise((resolve, reject) => {
    const app = context.express ? context.express : express();

    const defaultMiddleware = _getMiddleware(connectOpts);
    const customMiddleware = Array.isArray(context.middleware) ? context.middleware : null;
    const customPreMiddleware = context.preMiddleware || [];
    const customPostMiddleware = context.postMiddleware || [];

    let appMiddleware;
    if (customMiddleware) {
      appMiddleware = customMiddleware;
    } else {
      appMiddleware = [...customPreMiddleware, ...defaultMiddleware, ...customPostMiddleware];
    }

    appMiddleware.forEach((middleware) => {
      let middlewareArray = middleware;
      if (!Array.isArray(middlewareArray)) {
        middlewareArray = [middlewareArray];
      }
      app.use.apply(app, middlewareArray); //eslint-disable-line
    });

    let server;
    if (context.server) {
      // Use user's custom server -- this means none of our default middleware applies
      server = context.server;
    } else if (context.serverOptions) {
      server = context.http ? context.http.createServer(context.serverOptions, app) :
        http.createServer(context.serverOptions, app);
    } else {
      server = context.http ? context.http.createServer(app) : http.createServer(app);
    }

    const hostname = connectOpts.hostname || '127.0.0.1';
    const targetHostname = _getTargetHostname(hostname);
    const urlPrefix = context.urlPrefix ? context.urlPrefix : 'http';
    const defaultTarget = `${urlPrefix}://${targetHostname}:${connectOpts.port}`;
    const target = connectOpts.serverUrl ? connectOpts.serverUrl : defaultTarget;
    console.log(`Connecting to ${target}`);
    server
      .listen(connectOpts.port, hostname)
      .on('listening', () => {
        utils.log.success(`Server ready: ${target}`);
        if (connectOpts.open) {
          open(target);
        }
        resolve();
      })
      .on('error', (err) => {
        reject(err);
      });
  });
};

function _getMiddleware(options) {
  const middlewares = [];
  middlewares.push(_getHostValidationMiddleware(options));
  if (options.livereload) {
    const livereloadConfig = { port: options.livereloadPort, hostname: options.hostname };
    middlewares.push(injectLiveReload(livereloadConfig));
  }
  middlewares.push(..._getDefaultMiddleware(options));
  return middlewares;
}

function _getHostValidationMiddleware(options) {
  if (_isAllInterfacesHostname(options.hostname)) {
    return (req, res, next) => next();
  }

  const allowedHosts = _getAllowedHosts(options.hostname);
  return (req, res, next) => {
    const requestHost = _getHostnameFromHeader(req.headers.host);
    if (allowedHosts.indexOf(requestHost) !== -1) {
      next();
      return;
    }
    res.statusCode = 403;
    res.end('Invalid Host header');
  };
}

function _getDefaultMiddleware(options) {
  const middlewares = [];
  const middlewareOpts = options;
  if (!Array.isArray(middlewareOpts.base)) {
    middlewareOpts.base = [middlewareOpts.base];
  }
  // Options for serve-static module. See https://www.npmjs.com/package/serve-static
  const defaultStaticOptions = {};
  const directory = middlewareOpts.directory || middlewareOpts.base[middlewareOpts.base.length - 1];
  middlewareOpts.base.forEach((base) => {
    // Serve static files.
    const rootPath = base.path || base;
    const staticOptions = base.options || defaultStaticOptions;
    middlewares.push(serveStatic(rootPath, staticOptions));
  });
  if (middlewareOpts.directoryListing) {
    // Make directory browse-able when explicitly requested.
    middlewares.push(serveIndex(directory.path || directory));
  }
  return middlewares;
}

function _processCustomOptions(opts) {
  const result = Object.assign({}, opts || {});
  result.hostname = _normalizeHostname(result.hostname);

  if (result.port === '?') {
    result.port = 0;
  }

  const defaultOpts = _getDefaultOptions();
  return Object.assign({ livereloadPort: result.livereloadPort }, defaultOpts, result);
}

function _getDefaultOptions() {
  return {
    port: 8000,
    hostname: '127.0.0.1',
    directoryListing: false,
    livereload: true,
    open: true
  };
}

function _getTargetHostname(hostname) {
  return hostname === '0.0.0.0' || hostname === '127.0.0.1' ? 'localhost' : hostname;
}

function _normalizeHostname(hostname) {
  if (hostname === '*') {
    utils.log.warning(
      "Wildcard hostname '*' is not used for binding. " +
      "Use '0.0.0.0' to explicitly expose the development server."
    );
  }
  return hostname && hostname !== '*' ? hostname : '127.0.0.1';
}

function _isAllInterfacesHostname(hostname) {
  return hostname === '0.0.0.0' || hostname === '::';
}

function _getAllowedHosts(hostname) {
  const allowedHosts = LOCAL_HOSTNAMES.slice();
  const configuredHost = _normalizeConfiguredHostname(hostname);
  if (configuredHost && allowedHosts.indexOf(configuredHost) === -1) {
    allowedHosts.push(configuredHost);
  }
  return allowedHosts;
}

function _normalizeConfiguredHostname(hostname) {
  if (!hostname || _isAllInterfacesHostname(hostname)) {
    return null;
  }
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function _getHostnameFromHeader(hostHeader) {
  if (!hostHeader) {
    return '';
  }
  const host = String(hostHeader).trim().toLowerCase();
  if (host.indexOf('[') === 0) {
    const closingBracketIndex = host.indexOf(']');
    return closingBracketIndex === -1 ? host : host.slice(1, closingBracketIndex);
  }
  return host.split(':')[0];
}

module.exports.__getDefaultMiddleware = _getDefaultMiddleware;
module.exports.__getMiddleware = _getMiddleware;
module.exports.__getHostValidationMiddleware = _getHostValidationMiddleware;
module.exports.__processCustomOptions = _processCustomOptions;
