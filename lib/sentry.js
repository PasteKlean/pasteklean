'use strict';

let Sentry = null;
let initialized = false;

function init({ dsn, release, environment, logger }) {
  if (!dsn) {
    return null;
  }

  try {
    Sentry = require('@sentry/electron/main');
    Sentry.init({
      dsn,
      release,
      environment,
      beforeSend(event) {
        if (event.exception) {
          logger.error('Sentry captured exception', event.exception);
        }
        return event;
      },
    });
    initialized = true;
    logger.info('Sentry initialized');
  } catch (err) {
    logger.error('Failed to initialize Sentry:', err);
    Sentry = null;
  }

  return Sentry;
}

function captureException(err) {
  if (initialized && Sentry && Sentry.captureException) {
    Sentry.captureException(err);
  }
}

function captureMessage(message) {
  if (initialized && Sentry && Sentry.captureMessage) {
    Sentry.captureMessage(message);
  }
}

module.exports = {
  init,
  captureException,
  captureMessage,
};
