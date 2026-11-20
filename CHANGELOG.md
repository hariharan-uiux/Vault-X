# Changelog

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
