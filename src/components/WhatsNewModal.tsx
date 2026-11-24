import React, { useEffect, useState } from "react"
import { Sparkles, ExternalLink, Calendar, Check, Download, Tag, ArrowRight } from "lucide-react"
import { VaultXLogo } from "@/components/VaultXLogo"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export interface VersionRelease {
  version: string
  tag: string
  name: string
  date: string
  notes: string
  highlights?: string[]
  isLatest?: boolean
  htmlUrl?: string
}

// Built-in version history from CHANGELOG
const BUNDLED_RELEASES: VersionRelease[] = [
  {
    version: "1.9.0",
    tag: "vault-x-v1.9.0",
    name: "Vault X v1.9.0",
    date: "2026-11-24",
    highlights: [
      "Official Brand Identity: High-resolution dark obsidian squircle icon with dimensional beveled 'X' and emerald core.",
      "Windows App Icon: Native multi-resolution ICO (16×16 to 256×256) for installer, taskbar, and desktop shortcuts.",
      "Silent Updater Execution: Completely hides background CMD console windows during self-updates (only the installer window appears).",
      "Refined Brand UI: Integrated vector Vault X logo mark across header, settings, and release modals.",
    ],
    notes: `### Features
• **brand:** official Vault X obsidian vault brand mark, multi-resolution Windows ICO, and vector logo components ([1d0605c](https://github.com/hariharan-uiux/Vault-X/commit/1d0605c0df8b67034715986823b65dce487921c8))

### Bug Fixes
• **updater:** hide background CMD console popups during self-updates via wscript SW_HIDE ([aa5cc91](https://github.com/hariharan-uiux/Vault-X/commit/aa5cc91f9b7c8fb263df363ea2fe1a8bb6746816))
• **settings:** bind dynamic client version in diagnostics info`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.9.0",
  },
  {
    version: "1.8.0",
    tag: "vault-x-v1.8.0",
    name: "Vault X v1.8.0",
    date: "2026-11-24",
    highlights: [
      "What's New Modal: Built-in release explorer with complete version history, feature highlights, and direct GitHub links.",
      "Local App Recognition: Automatically discovers previously installed apps on system across Start Menu, AppData, and registry.",
      "Streamlined App Actions: Shows 'Open' for installed apps, and amber 'Update' only when newer GitHub releases are found.",
      "Cleaner Dashboard: Simplified top metrics bar focusing on Total Apps, Installed count, and Platform.",
    ],
    notes: `### Features
• **ui:** add What's New modal with full version history and release notes
• **detection:** recognize previously installed apps on reinstall and restrict Update to installed apps
• **detection:** resolve real installed version on repo add and switch card action to Open/Update

### Style
• **dashboard:** remove RAM and Fast Startup metric cards from top bar`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.8.0",
  },
  {
    version: "1.7.0",
    tag: "vault-x-v1.7.0",
    name: "Vault X v1.7.0",
    date: "2026-11-23",
    highlights: [
      "Architecture-Aware Asset Matching: Prevents downloading ARM64 binaries on x64 Windows PCs, resolving shortcut 'browse file' errors.",
      "Pure User-Driven Catalog: Removed all hardcoded default applications from catalog so it strictly hosts apps added by you.",
      "Reliable Launch: Clack and other multi-architecture apps now install and launch the native x64 executable cleanly.",
    ],
    notes: `### Features
• **catalog:** remove hardcoded pre-bundled apps so catalog exclusively hosts user-added git repositories

### Bug Fixes
• **installer:** architecture-aware asset matching to prevent downloading arm64 on x64 systems, fixing Windows shortcut 'browse file' errors`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.7.0",
  },
  {
    version: "1.6.0",
    tag: "vault-x-v1.6.0",
    name: "Vault X v1.6.0",
    date: "2026-11-20",
    highlights: [
      "Contextual Empty States: Added direct 'Add App from GitHub' actions on empty search, installed, and catalog screens.",
      "Dual-Layer Persistence: User-added git projects survive app restarts and reinstallation via both Electron disk store and local storage.",
      "Flicker-Free Progress: Eliminated notification blinking during downloads and displays clean 'Downloading <App Name>' status.",
      "Icon-Only Toolbar: Modern, compact icon-only action buttons in the top header.",
      "Tag-Triggered CI: Regular git commits never trigger automated PRs or releases; releases build on explicit version tags.",
    ],
    notes: `### Features
• **ui:** contextual empty states with direct 'Add App from GitHub' action
• **header:** sleek icon-only buttons for toolbar actions

### Bug Fixes
• **persistence:** persist user-added GitHub apps across restarts in both electron store and local storage
• **progress:** eliminate download progress notification blinking and display clean app name
• **ci:** disable automated release PRs and trigger releases only on explicit tags`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.6.0",
  },
  {
    version: "1.5.1",
    tag: "vault-x-v1.5.1",
    name: "Vault X v1.5.1",
    date: "2026-11-20",
    highlights: [
      "Native Uninstaller Execution: Accurately locates and launches Windows uninstaller wizards rather than only deleting download cache.",
      "Shortcut Cleanup: Removes leftover Desktop and Start Menu shortcuts on uninstall.",
    ],
    notes: `### Bug Fixes
• **uninstall:** reliably run native uninstaller, remove shortcuts, and clean files`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.5.1",
  },
  {
    version: "1.5.0",
    tag: "vault-x-v1.5.0",
    name: "Vault X v1.5.0",
    date: "2026-11-20",
    highlights: [
      "Assisted Install Flow: Downloads and immediately opens native Windows setup wizards on screen (no silent blocks).",
      "Removed Destructive Uninstaller: Fixed issue where running previous uninstaller wiped out new app installations.",
      "Smart Executable Resolution: Automatically inspects Start Menu shortcuts and AppData programs to locate the installed exe.",
    ],
    notes: `### Features
• **install:** download and launch setup wizard on screen, removing uninstaller call`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.5.0",
  },
  {
    version: "1.4.2",
    tag: "vault-x-v1.4.2",
    name: "Vault X v1.4.2",
    date: "2026-11-20",
    highlights: [
      "SmartScreen Unblock: Automatically unblocks downloaded installers with PowerShell Unblock-File.",
      "Non-Hidden Execution: Removed hidden process spawning so UAC elevation and setup dialogs are never blocked.",
      "Zero-Click Upgrades: Configured NSIS oneClick: true and runAfterFinish: true for seamless launcher self-updates.",
    ],
    notes: `### Bug Fixes
• **installer:** robust Windows installer execution and update replacement`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.4.2",
  },
  {
    version: "1.4.1",
    tag: "vault-x-v1.4.1",
    name: "Vault X v1.4.1",
    date: "2026-11-20",
    highlights: [
      "Clean Borderless Window: Removed default application menu bar (File, Edit, View, Window).",
    ],
    notes: `### Bug Fixes
• **window:** remove default application menu bar (File, Edit, View, Window)`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.4.1",
  },
  {
    version: "1.4.0",
    tag: "vault-x-v1.4.0",
    name: "Vault X v1.4.0",
    date: "2026-11-20",
    highlights: [
      "Add App from GitHub: Paste any public GitHub repo URL to inspect its releases and install it with one click.",
      "Custom Repo Store: Adds user-imported repositories to catalog with automated update tracking.",
    ],
    notes: `### Features
• install and auto-update apps directly from GitHub repository links`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.4.0",
  },
  {
    version: "1.3.0",
    tag: "vault-x-v1.3.0",
    name: "Vault X v1.3.0",
    date: "2026-11-19",
    highlights: [
      "Catalog Expansion: Added Clack mechanical keyboard sound synthesizer.",
    ],
    notes: `### Features
• **catalog:** add Clack Windows app with exe installer to catalog`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.3.0",
  },
  {
    version: "1.2.1",
    tag: "vault-x-v1.2.1",
    name: "Vault X v1.2.1",
    date: "2026-11-19",
    highlights: [
      "In-App Updater: Replaces running app cleanly on update and caches downloaded installers.",
    ],
    notes: `### Bug Fixes
• quit before running the installer so the update actually replaces the old version
• reuse the cached installer instead of downloading it again on every click`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.2.1",
  },
  {
    version: "1.2.0",
    tag: "vault-x-v1.2.0",
    name: "Vault X v1.2.0",
    date: "2026-11-19",
    highlights: [
      "Catalog Apps: Added FolioBoard and Relay with GitHub release auto-update tracking.",
    ],
    notes: `### Features
• add FolioBoard and Relay as installable desktop apps with auto-update tracking`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.2.0",
  },
  {
    version: "1.1.1",
    tag: "vault-x-v1.1.1",
    name: "Vault X v1.1.1",
    date: "2026-11-19",
    highlights: [
      "Rebranding: Renamed project from App Launcher to Vault X with custom icon and NSIS packaging.",
    ],
    notes: `### Miscellaneous Chores
• rename the app and GitHub repository to Vault X`,
    htmlUrl: "https://github.com/hariharan-uiux/Vault-X/releases/tag/vault-x-v1.1.1",
  },
]

interface WhatsNewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentVersion: string
  hasUpdate?: boolean
  latestVersion?: string
  onApplyLauncherUpdate?: () => void
}

export function WhatsNewModal({
  open,
  onOpenChange,
  currentVersion,
  hasUpdate,
  latestVersion,
  onApplyLauncherUpdate,
}: WhatsNewModalProps) {
  const [releases, setReleases] = useState<VersionRelease[]>(BUNDLED_RELEASES)
  const [selectedVersion, setSelectedVersion] = useState<string>(BUNDLED_RELEASES[0].version)

  // Fetch live releases from GitHub API to ensure any newer releases are displayed dynamically
  useEffect(() => {
    if (!open) return
    fetch("https://api.github.com/repos/hariharan-uiux/Vault-X/releases?per_page=15", {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (!Array.isArray(data) || data.length === 0) return
        const liveReleases: VersionRelease[] = data.map((r) => {
          const rawTag = r.tag_name || ""
          const ver = rawTag.replace(/^vault-x-v/i, "").replace(/^[vV]/, "").trim()
          const bundled = BUNDLED_RELEASES.find((b) => b.version === ver)
          return {
            version: ver,
            tag: rawTag,
            name: r.name || `Vault X v${ver}`,
            date: r.published_at ? r.published_at.split("T")[0] : bundled?.date || "",
            notes: r.body || bundled?.notes || "",
            highlights: bundled?.highlights,
            htmlUrl: r.html_url || bundled?.htmlUrl,
          }
        })
        // Merge with bundled releases so historical release notes stay complete
        const knownVers = new Set(liveReleases.map((l) => l.version))
        const merged = [...liveReleases, ...BUNDLED_RELEASES.filter((b) => !knownVers.has(b.version))]
        setReleases(merged)
        if (merged.length > 0 && !selectedVersion) {
          setSelectedVersion(merged[0].version)
        }
      })
      .catch(() => {})
  }, [open])

  const activeRelease = releases.find((r) => r.version === selectedVersion) || releases[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden">
        {/* Header Bar */}
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/40">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <VaultXLogo className="h-9 w-9 flex-shrink-0" />
                <div>
                  <DialogTitle className="text-base font-bold text-zinc-100">What's New in Vault X</DialogTitle>
                  <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                    Version history, new features, and changelog highlights.
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Badge variant="installed" className="font-mono text-[11px] px-2 py-0.5">
                  v{currentVersion} • Current
                </Badge>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* 2-Column Main View */}
        <div className="flex flex-col sm:flex-row h-[420px] divide-y sm:divide-y-0 sm:divide-x divide-zinc-800">
          {/* Left Column: Version Selector List */}
          <div className="w-full sm:w-56 flex-shrink-0 overflow-y-auto bg-zinc-950/60 p-2 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono px-3 py-1.5 block">
              Version History ({releases.length})
            </span>
            {releases.map((rel, index) => {
              const isSelected = rel.version === activeRelease?.version
              const isCurrent = rel.version === currentVersion
              const isLatest = index === 0

              return (
                <button
                  key={rel.version}
                  onClick={() => setSelectedVersion(rel.version)}
                  className={`w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between border ${
                    isSelected
                      ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                      : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <Tag className="h-3 w-3 text-zinc-500 flex-shrink-0" />
                      <span className="font-mono text-xs font-semibold truncate">v{rel.version}</span>
                    </div>
                    {rel.date && (
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5 ml-4">
                        {rel.date}
                      </span>
                    )}
                  </div>
                  {isLatest && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                      latest
                    </span>
                  )}
                  {isCurrent && !isLatest && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 bg-zinc-800 border border-zinc-700 text-zinc-300">
                      installed
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Right Column: Active Version Release Details */}
          <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 overflow-hidden">
            {activeRelease && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Release Title Area */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
                  <div>
                    <div className="flex items-center space-x-2.5">
                      <h3 className="text-base font-bold text-zinc-100 tracking-tight">
                        {activeRelease.name || `Vault X v${activeRelease.version}`}
                      </h3>
                      {activeRelease.version === currentVersion && (
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                          Active Version
                        </span>
                      )}
                    </div>
                    {activeRelease.date && (
                      <div className="flex items-center space-x-1.5 text-xs text-zinc-400 font-mono mt-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Released on {activeRelease.date}</span>
                      </div>
                    )}
                  </div>

                  {/* Update action if newer version is viewed */}
                  {hasUpdate && activeRelease.version === latestVersion && onApplyLauncherUpdate && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onOpenChange(false)
                        onApplyLauncherUpdate()
                      }}
                      className="text-xs h-8 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3 shadow"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      <span>Update to v{activeRelease.version}</span>
                    </Button>
                  )}
                </div>

                {/* Curated Highlights if available */}
                {activeRelease.highlights && activeRelease.highlights.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                      Key Highlights
                    </h4>
                    <div className="space-y-1.5 bg-zinc-900/40 p-3.5 border border-zinc-800/80">
                      {activeRelease.highlights.map((h, i) => (
                        <div key={i} className="flex items-start space-x-2 text-xs text-zinc-200 leading-relaxed">
                          <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Markdown Changelog notes */}
                {activeRelease.notes && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                      Changelog Details
                    </h4>
                    <div className="bg-zinc-900/30 p-4 border border-zinc-800 text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                      {activeRelease.notes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
          <a
            href={activeRelease?.htmlUrl || "https://github.com/hariharan-uiux/Vault-X/releases"}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-400 hover:text-emerald-400 font-mono flex items-center space-x-1.5 transition-colors"
          >
            <span>View Release on GitHub</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 border-zinc-800 text-zinc-300 hover:text-zinc-100"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
