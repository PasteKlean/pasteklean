'use strict';

const { app, crashReporter } = require('electron');

function setupCrashReporter({ logger, sentry }) {
  try {
    crashReporter.start({
      submitURL: '',
      uploadToServer: false,
      ignoreSystemCrashHandler: true,
    });
    logger.info('Crash reporter started');
  } catch (err) {
    logger.error('Failed to start crash reporter:', err);
  }

  const isRelaunch = process.argv.includes('--relaunch');

  function attemptRelaunch(reason) {
    if (isRelaunch) {
      logger.error(`App ${reason}; already relaunched once, not restarting again to avoid loop.`);
      return;
    }

    logger.error(`App ${reason}; attempting relaunch...`);
    try {
      const args = process.argv.slice(1).filter((arg) => arg !== '--relaunch');
      args.push('--relaunch');
      app.relaunch({ args });
      app.exit(1);
    } catch (err) {
      logger.error('Failed to relaunch app:', err);
    }
  }

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    if (sentry && sentry.captureException) {
      sentry.captureException(err);
    }
    attemptRelaunch('crashed (uncaught exception)');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    if (sentry && sentry.captureException && reason instanceof Error) {
      sentry.captureException(reason);
    }
  });

  app.on('render-process-gone', (_event, _webContents, details) => {
    logger.error('Render process gone:', details);
    if (details.reason === 'crashed' || details.reason === 'killed') {
      attemptRelaunch(`renderer ${details.reason}`);
    }
  });

  app.on('child-process-gone', (_event, details) => {
    logger.error('Child process gone:', details);
    if (details.reason === 'crashed' || details.reason === 'killed') {
      attemptRelaunch(`child process ${details.reason}`);
    }
  });
}

module.exports = {
  setupCrashReporter,
};
