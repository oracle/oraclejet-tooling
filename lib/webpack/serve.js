/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
module.exports = (options) => {
  // eslint-disable-next-line global-require
  const webpackUtils = require('./utils');
  // eslint-disable-next-line global-require
  const setup = require('./setup');
  // eslint-disable-next-line global-require
  const ojetUtils = require('../util');
  // eslint-disable-next-line global-require
  const hookRunner = require('../hookRunner');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const WebpackDevServer = ojetUtils.requireLocalFirst('webpack-dev-server');
  return new Promise(async () => {
    ojetUtils.log('Serving with Webpack');
    const serveContext = webpackUtils.createContext({ options, platform: 'web' });
    const { webpack, context, webpackConfig } = setup(serveContext);
    const compiler = webpack(webpackConfig);
    if (webpackConfig.devServer) {
      const devServerOptions = { ...webpackConfig.devServer };
      // Update the context object:
      context.compiler = compiler;
      context.port = devServerOptions.port || 8001;
      context.host = devServerOptions.host || '127.0.0.1';
      // Run the before_serve hook with the updated context:
      await hookRunner('before_serve', context);
      const server = new WebpackDevServer(devServerOptions, context.compiler);
      // Start the server:
      await server.start(context.port, context.host);
      // Run the after serve hook:
      await hookRunner('after_serve', context);
    } else {
      ojetUtils.log.error(
        `
          Serving with the --release flag is currently not supported. Please
          run 'ojet build --release' and then serve the built folder
          using your favorite command line server (e.g. http-server).
        `.replace(/\n/g, '').replace(/\s+/g, ' ')
      );
    }
  });
};
