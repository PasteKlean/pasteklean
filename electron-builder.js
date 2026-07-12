const { env } = process;

const winTargets = [
  { target: 'nsis', arch: ['x64', 'ia32'] },
  { target: 'portable', arch: ['x64'] },
];

const appxConfig =
  env.MSIX_PUBLISHER && env.MSIX_IDENTITY_NAME
    ? {
        target: 'appx',
        arch: ['x64'],
      }
    : null;

if (appxConfig) {
  winTargets.push(appxConfig);
}

const macNotarize =
  (env.CSC_LINK || env.CSC_NAME) &&
  (
    (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
    (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)
  );

const mac = {
  target: [
    { target: 'dmg', arch: ['x64', 'arm64'] },
    { target: 'zip', arch: ['x64', 'arm64'] },
  ],
  category: 'public.app-category.utilities',
  icon: 'assets/icon.icns',
  hardenedRuntime: true,
  gatekeeperAssess: false,
};

if (macNotarize) {
  mac.notarize = true;
}

const appxBuilder = appxConfig
  ? {
      appx: {
        applicationId: env.MSIX_APPLICATION_ID || 'App',
        identityName: env.MSIX_IDENTITY_NAME,
        publisher: env.MSIX_PUBLISHER,
        publisherDisplayName: env.MSIX_PUBLISHER_DISPLAY_NAME || env.MSIX_DISPLAY_NAME || 'PasteKlean',
        displayName: env.MSIX_DISPLAY_NAME || 'PasteClean',
        backgroundColor: env.MSIX_BACKGROUND_COLOR || 'transparent',
        languages: env.MSIX_LANGUAGES ? env.MSIX_LANGUAGES.split(',') : ['en-US'],
        artifactName: '${productName}-${version}.msix',
        minVersion: '10.0.17763.0',
        maxVersionTested: '10.0.22621.0',
      },
    }
  : {};

module.exports = {
  appId: 'io.surgegrid.pasteclean',
  productName: 'PasteClean',
  copyright: 'Copyright © 2026 SurgeGrid',
  electronUpdaterCompatibility: '>= 2.16',
  publish: null,
  directories: {
    output: 'dist',
  },
  files: ['main.js', 'preload.js', 'renderer/**/*', 'assets/**/*'],
  mac,
  win: {
    target: winTargets,
    icon: 'assets/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
    shortcutName: 'PasteClean',
  },
  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  ...appxBuilder,
};
