# Changelog

## [1.9.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.8.0...vault-x-v1.9.0) (2026-11-24)

### Features

* **brand:** official Vault X obsidian vault brand mark, multi-resolution Windows ICO, and vector logo components ([1d0605c](https://github.com/hariharan-uiux/Vault-X/commit/1d0605c0df8b67034715986823b65dce487921c8))

### Bug Fixes

* **updater:** hide background CMD console windows during updates ([aa5cc91](https://github.com/hariharan-uiux/Vault-X/commit/aa5cc91f9b7c8fb263df363ea2fe1a8bb6746816))
* **settings:** bind dynamic client version in diagnostics info

## [1.8.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.7.0...vault-x-v1.8.0) (2026-11-24)

### Features

* **ui:** add What's New modal with full version history and release notes ([cc948a8](https://github.com/hariharan-uiux/Vault-X/commit/cc948a845174e38355d0cd89a88eb322915852cc))
* **detection:** recognize previously installed apps on reinstall and restrict Update to installed apps ([f71e16d](https://github.com/hariharan-uiux/Vault-X/commit/f71e16d9e6f3488b59a67b077ebf948f3e89f043))
* **detection:** resolve real installed version on repo add and switch card action to Open/Update ([1b2360f](https://github.com/hariharan-uiux/Vault-X/commit/1b2360fbc13c5752182527bf0dd64cd671301d3d))

### Style

* **dashboard:** remove RAM and Fast Startup metric cards from top bar ([70b7e5b](https://github.com/hariharan-uiux/Vault-X/commit/70b7e5b408f881bf33fd8682f8a729853f31db2f))

## [1.7.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.6.0...vault-x-v1.7.0) (2026-11-23)

### Features

* **catalog:** remove hardcoded pre-bundled apps so catalog exclusively hosts user-added git repositories ([6800183](https://github.com/hariharan-uiux/Vault-X/commit/6800183ef9f61b0d23cb7a5a8eb8d234a9e5dbf0))

### Bug Fixes

* **installer:** architecture-aware asset matching to prevent downloading arm64 on x64 systems, fixing Windows shortcut 'browse file' errors ([8b953aa](https://github.com/hariharan-uiux/Vault-X/commit/8b953aae2a87c1cb50a5814bc3a1c6a2824df4ce))

## [1.6.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.5.1...vault-x-v1.6.0) (2026-11-20)

### Features

* **ui:** contextual empty states with direct 'Add App from GitHub' action ([341466e](https://github.com/hariharan-uiux/Vault-X/commit/341466ea6d82006764ca4b341c2c31e786b24017))
* **header:** sleek icon-only buttons for toolbar actions ([cf529d0](https://github.com/hariharan-uiux/Vault-X/commit/cf529d08e8b159f815b3c586113b2cf2759e9bf9))

### Bug Fixes

* **persistence:** persist user-added GitHub apps across restarts in both electron store and local storage ([5c57295](https://github.com/hariharan-uiux/Vault-X/commit/5c57295a4687d6052f992e59173eb56b940989db))
* **progress:** eliminate download progress notification blinking and display clean app name ([cf87d45](https://github.com/hariharan-uiux/Vault-X/commit/cf87d45f3c9598a6344d3264d8ad4422e57eeff0))
* **ci:** disable automated release PRs and trigger releases only on explicit tags ([ad3d160](https://github.com/hariharan-uiux/Vault-X/commit/ad3d1605f6e52003c4075f917b07f8728a2a514d))

## [1.5.1](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.5.0...vault-x-v1.5.1) (2026-11-20)


### Bug Fixes

* **uninstall:** reliably run native uninstaller, remove shortcuts, and clean files ([41c07c1](https://github.com/hariharan-uiux/Vault-X/commit/41c07c1e31d6f3456697e84ac0c3c7784a35632b))

## [1.5.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.4.2...vault-x-v1.5.0) (2026-11-20)


### Features

* **install:** download and launch setup wizard on screen, removing uninstaller call ([cff1d48](https://github.com/hariharan-uiux/Vault-X/commit/cff1d4891b28e743f947005587d80e31cd6c950e))

## [1.4.2](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.4.1...vault-x-v1.4.2) (2026-11-20)


### Bug Fixes

* **installer:** robust Windows installer execution and update replacement ([025acb8](https://github.com/hariharan-uiux/Vault-X/commit/025acb8eae220e62c01beacc08ebec1efa153a40))

## [1.4.1](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.4.0...vault-x-v1.4.1) (2026-11-20)


### Bug Fixes

* **window:** remove default application menu bar (File, Edit, View, Window) ([5e25a20](https://github.com/hariharan-uiux/Vault-X/commit/5e25a2014b0787e7eeef372971a65ab22b80057d))

## [1.4.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.3.0...vault-x-v1.4.0) (2026-11-20)


### Features

* install and auto-update apps directly from GitHub repository links ([69dd9c1](https://github.com/hariharan-uiux/Vault-X/commit/69dd9c13fa0dd4345ec91de34dd962c07fa0f913))

## [1.3.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.2.1...vault-x-v1.3.0) (2026-11-19)


### Features

* **catalog:** add Clack Windows app with exe installer to catalog ([e750f34](https://github.com/hariharan-uiux/Vault-X/commit/e750f34b56433ebf3ad04d819227cad687501f29))

## [1.2.1](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.2.0...vault-x-v1.2.1) (2026-11-19)


### Bug Fixes

* quit before running the installer so the update actually replaces the old version
* reuse the cached installer instead of downloading it again on every click
* replace the running AppImage in place on Linux updates


## [1.2.0](https://github.com/hariharan-uiux/Vault-X/compare/vault-x-v1.1.1...vault-x-v1.2.0) (2026-11-19)


### Features

* add FolioBoard and Relay as installable desktop apps with auto-update tracking
* prefer the full installer over a portable build when a release ships both


## [1.1.1](https://github.com/hariharan-uiux/Vault-X/compare/personal-app-launcher-v1.1.0...vault-x-v1.1.1) (2026-11-19)


### Miscellaneous Chores

* rename the app and GitHub repository to Vault X ([47995da](https://github.com/hariharan-uiux/Vault-X/commit/47995da))


### Continuous Integration

* upgrade the release-please action to v5 ([c7b80db](https://github.com/hariharan-uiux/Vault-X/commit/c7b80db))


### Documentation

* note the release tag convention ([99929d1](https://github.com/hariharan-uiux/Vault-X/commit/99929d1))


## [1.1.0](https://github.com/hariharan-uiux/app-launcher/compare/personal-app-launcher-v1.0.0...personal-app-launcher-v1.1.0) (2026-11-11)


### Features

* add folioboard with github release targets to catalog ([3d8bf2d](https://github.com/hariharan-uiux/app-launcher/commit/3d8bf2de150864f46155877a7961e496fd426c15))
* add folioboard, linux-system-controller, structured-planner, pi-metrics, project-t, aix-vault, and relay to app catalog ([2232fb2](https://github.com/hariharan-uiux/app-launcher/commit/2232fb296c1199c7283992a6b9ab6922e4500043))
* add github release update detection for catalog apps ([1de39db](https://github.com/hariharan-uiux/app-launcher/commit/1de39db7abfe62ee05dce0f5defdc8d1da812356))
* add linux-system-controller with linux-only install target ([3b64a93](https://github.com/hariharan-uiux/app-launcher/commit/3b64a93965042121a152159352028766e9a6b4d7))
* add pi-metrics with github release targets to catalog ([5a138e8](https://github.com/hariharan-uiux/app-launcher/commit/5a138e85a82e71ae27575c289b26650a94dcd8ad))
* add structured-planner with windows and linux release targets ([193aef2](https://github.com/hariharan-uiux/app-launcher/commit/193aef2714c396bb9e3923726fc267378d622ae8))
* initial scaffold of personal cross-platform App Launcher with shadcn/ui neutral theme ([ae9104b](https://github.com/hariharan-uiux/app-launcher/commit/ae9104b80282e65ace9f088738a00f4bc8eb0368))
* integrate real GitHub release installation and single-app catalog for Relay ([c826558](https://github.com/hariharan-uiux/app-launcher/commit/c826558c01b9854210b088ead0c9ad07b0f4b5e3))
* refine contiguous grid layout without empty shells and add settings modal ([9204b7f](https://github.com/hariharan-uiux/app-launcher/commit/9204b7fdb3e174c21efb543f38a9b69bc5ad5f96))
