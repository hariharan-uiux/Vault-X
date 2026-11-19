import { AppItem } from "@/types/catalog"

export interface GitHubReleaseInfo {
  tag_name: string
  name?: string
  body?: string
  html_url?: string
  published_at?: string
}

/**
 * Compare two semver strings: a and b.
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if a == b
 */
export function compareSemver(a: string, b: string): number {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1

  const cleanA = a.replace(/^[vV]/, "").trim()
  const cleanB = b.replace(/^[vV]/, "").trim()

  const partsA = cleanA.split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0)
  const partsB = cleanB.split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0)

  const len = Math.max(partsA.length, partsB.length, 3)
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }
  return 0
}

/**
 * Fetch the latest GitHub release metadata for an owner/repo repository.
 */
export async function fetchLatestRelease(githubRepo: string): Promise<GitHubReleaseInfo | null> {
  try {
    const cleanRepo = githubRepo.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "").trim()
    if (!cleanRepo || !cleanRepo.includes("/")) return null

    const url = `https://api.github.com/repos/${cleanRepo}/releases/latest`
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!res.ok) {
      // Release not found or rate limited
      return null
    }

    const data = await res.json()
    if (!data || !data.tag_name) return null

    return {
      tag_name: data.tag_name,
      name: data.name,
      body: data.body,
      html_url: data.html_url,
      published_at: data.published_at,
    }
  } catch (err) {
    console.warn(`[GitHubUpdates] Failed to check release for ${githubRepo}:`, err)
    return null
  }
}

/**
 * Checks all apps with a configured `github` repository field against GitHub's Releases API.
 * Detects if a newer version is released and updates status to 'update_available'.
 */
export async function checkAppUpdates(apps: AppItem[]): Promise<{
  updatedApps: AppItem[]
  updatesFound: number
}> {
  let updatesFound = 0

  const results = await Promise.all(
    apps.map(async (app) => {
      if (!app.github) return app

      const release = await fetchLatestRelease(app.github)
      if (!release || !release.tag_name) return app

      const latestVersion = release.tag_name.replace(/^[vV]/, "").trim()
      const currentVersion = app.installedVersion || app.version

      // Check if the GitHub release is newer than our installed/catalog version
      if (compareSemver(latestVersion, currentVersion) > 0) {
        updatesFound++
        return {
          ...app,
          status: (app.installedVersion ? "update_available" : app.status) as typeof app.status,
          version: latestVersion,
          releaseNotes: release.body || app.releaseNotes,
          releaseUrl: release.html_url || app.releaseUrl,
        }
      }

      // If not installed, still keep catalog version updated to latest release
      if (app.status === "not_installed" && compareSemver(latestVersion, app.version) > 0) {
        return {
          ...app,
          version: latestVersion,
          releaseNotes: release.body || app.releaseNotes,
          releaseUrl: release.html_url || app.releaseUrl,
        }
      }

      return app
    })
  )

  return {
    updatedApps: results,
    updatesFound,
  }
}

export interface VaultXUpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseName?: string
  releaseNotes?: string
  releaseUrl?: string
  publishedAt?: string
  asset?: {
    name: string
    size: number
    downloadUrl: string
  } | null
}

/**
 * Checks for updates to the Vault X desktop application itself via GitHub Releases.
 */
export async function checkVaultXUpdate(currentVersion: string = "1.1.1"): Promise<VaultXUpdateInfo> {
  // If running inside Electron, use the IPC handler first
  if (window.electronAPI?.checkForLauncherUpdates) {
    try {
      const res = await window.electronAPI.checkForLauncherUpdates()
      if (res && res.ok) {
        return {
          hasUpdate: !!res.hasUpdate,
          currentVersion: res.currentVersion || currentVersion,
          latestVersion: res.latestVersion || currentVersion,
          releaseName: res.releaseName,
          releaseNotes: res.releaseNotes,
          releaseUrl: res.releaseUrl,
          publishedAt: res.publishedAt,
          asset: res.asset || null,
        }
      }
    } catch (e) {
      console.warn("[VaultX] Electron updater check failed, falling back to direct API:", e)
    }
  }

  // Web fallback or direct GitHub fetch
  try {
    const res = await fetch("https://api.github.com/repos/hariharan-uiux/Vault-X/releases/latest", {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!res.ok) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
      }
    }

    const data = await res.json()
    const rawTag = data.tag_name || ""
    const latestVersion = rawTag.replace(/^vault-x-v/i, "").replace(/^[vV]/, "").trim()
    const hasUpdate = compareSemver(latestVersion, currentVersion) > 0

    const assets = data.assets || []
    const exeAsset = assets.find(
      (a: any) => typeof a.name === "string" && a.name.endsWith(".exe") && !a.name.includes("blockmap")
    ) || assets[0]

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      releaseName: data.name,
      releaseNotes: data.body,
      releaseUrl: data.html_url,
      publishedAt: data.published_at,
      asset: exeAsset
        ? {
            name: exeAsset.name,
            size: exeAsset.size,
            downloadUrl: exeAsset.browser_download_url,
          }
        : null,
    }
  } catch (err) {
    console.warn("[VaultX] Failed to check for Vault X updates:", err)
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
    }
  }
}
