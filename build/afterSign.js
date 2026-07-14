/* eslint-disable no-console */
'use strict';

const { notarize } = require('@electron/notarize');

module.exports = async (context) => {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const {
    APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID,
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_API_ISSUER,
  } = process.env;

  if (!APPLE_ID && !APPLE_API_KEY) {
    console.log('Skipping macOS notarization: no Apple credentials set.');
    return;
  }

  const options = {
    appPath,
    tool: APPLE_API_KEY ? 'notarytool' : 'legacy',
  };

  if (APPLE_API_KEY) {
    options.appleApiKey = APPLE_API_KEY;
    options.appleApiIssuer = APPLE_API_ISSUER;
    options.appleApiKeyId = APPLE_API_KEY_ID;
  } else {
    options.appleId = APPLE_ID;
    options.appleIdPassword = APPLE_APP_SPECIFIC_PASSWORD;
    options.ascProvider = APPLE_TEAM_ID;
  }

  console.log('Notarizing', appPath);
  await notarize(options);
  console.log('Notarization complete');
};
