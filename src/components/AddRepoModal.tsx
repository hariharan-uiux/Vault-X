import React, { useEffect, useState } from "react"
import { GitBranch, RefreshCw, AlertCircle, Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AppItem } from "@/types/catalog"
import { fetchRepoReleases, parseVersionFromTag, RepoRelease } from "@/lib/githubUpdates"

interface AddRepoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddRepo: (app: AppItem) => void
  onRemoveRepo: (appId: string) => void
  onInstall: (app: AppItem) => void
}

interface AddedRepo {
  id: string
  name: string
  github?: string
  version: string
}

export function AddRepoModal({ open, onOpenChange, onAddRepo, onRemoveRepo, onInstall }: AddRepoModalProps) {
  const [urlInput, setUrlInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    app: AppItem
    releases: RepoRelease[]
  } | null>(null)
  const [added, setAdded] = useState<AddedRepo[]>([])

  const refreshAdded = async () => {
    if (window.electronAPI?.listRepos) {
      const res = await window.electronAPI.listRepos()
      if (res.ok && Array.isArray(res.apps)) {
        setAdded(
          res.apps.map((a: any) => ({
            id: a.id,
            name: a.name,
            github: a.github,
            version: a.version,
          }))
        )
        return
      }
    }
    try {
      const saved = JSON.parse(localStorage.getItem("vaultx_added_repos") || "[]")
      setAdded(Array.isArray(saved) ? saved : [])
    } catch {
      setAdded([])
    }
  }

  useEffect(() => {
    if (open) {
      refreshAdded()
      setErrorMsg(null)
      setPreview(null)
    }
  }, [open])

  const buildApp = (repo: string, name: string, description: string, releases: RepoRelease[]): AppItem => {
    const latest = releases.find((r) => !r.prerelease) || releases[0] || null
    const [owner, repoName] = repo.split("/")
    const asset = latest?.assets.find((a) => /setup|install/i.test(a.name) && /\.exe$/i.test(a.name)) || latest?.assets[0]
    return {
      id: `gh-${repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name: name || repoName,
      description: description || `GitHub project ${repo}`,
      icon: "Package",
      category: "My Repos",
      tags: ["GitHub", "Added by you"],
      version: latest?.version || "0.0.0",
      installedVersion: null,
      status: "not_installed",
      author: owner,
      size: asset ? `${(asset.size / 1024 / 1024).toFixed(0)} MB` : "—",
      homepage: `https://github.com/${repo}`,
      github: repo,
      releaseNotes: latest?.notes || "",
      releaseUrl: latest?.htmlUrl || `https://github.com/${repo}/releases`,
      source: "custom",
      installTargets: asset
        ? { windows: { type: "exe", command: asset.name, downloadUrl: asset.downloadUrl } }
        : {},
    }
  }

  const handleFetch = async () => {
    setErrorMsg(null)
    setPreview(null)
    if (!urlInput.trim()) {
      setErrorMsg("Paste a GitHub repository link first.")
      return
    }

    setLoading(true)
    try {
      if (window.electronAPI?.inspectRepo) {
        const res = await window.electronAPI.inspectRepo(urlInput)
        if (!res.ok || !res.app) {
          setErrorMsg(res.error || "Could not read that repository.")
          return
        }
        const releases: RepoRelease[] = (res.releases || []).map((r: any) => ({
          tag: r.tag,
          version: parseVersionFromTag(r.tag),
          name: r.name,
          publishedAt: r.publishedAt,
          prerelease: r.prerelease,
          htmlUrl: r.htmlUrl,
          notes: r.notes,
          assets: r.asset ? [{ name: r.asset, size: 0, downloadUrl: "" }] : [],
        }))
        setPreview({ app: res.app as AppItem, releases })
      } else {
        const info = await fetchRepoReleases(urlInput)
        if (!info) {
          setErrorMsg("Could not read that repository. Check the link, or that it is public.")
          return
        }
        setPreview({
          app: buildApp(info.repo, info.name, info.description, info.releases),
          releases: info.releases,
        })
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Could not read that repository.")
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!preview) return
    setErrorMsg(null)
    setLoading(true)

    try {
      if (window.electronAPI?.addRepo) {
        const res = await window.electronAPI.addRepo(preview.app)
        if (!res.ok) {
          setErrorMsg(res.error || "Could not add that repository.")
          return
        }
        onAddRepo((res.app || preview.app) as AppItem)
      } else {
        onAddRepo(preview.app)
      }

      await refreshAdded()
      setPreview(null)
      setUrlInput("")
      onOpenChange(false)
    } catch (err: any) {
      setErrorMsg(err.message || "Could not add that repository.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center space-x-2">
            <GitBranch className="h-4 w-4 text-zinc-100" />
            <span>Add app from GitHub</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Paste any public GitHub repository. Vault X reads its releases, installs the newest one, and keeps it
            updated when a new release is published.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Repository link</label>
            <div className="flex items-center space-x-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleFetch()}
                placeholder="https://github.com/owner/repo"
                className="text-xs font-mono bg-zinc-900 border-zinc-800 h-9"
              />
              <Button
                size="sm"
                onClick={handleFetch}
                disabled={loading}
                className="text-xs h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 px-3"
              >
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <span>Check</span>}
              </Button>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center space-x-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {preview && (
            <div className="border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{preview.app.name}</p>
                  <p className="text-[11px] text-zinc-400 font-mono truncate">{preview.app.github}</p>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 whitespace-nowrap">
                  latest v{preview.app.version}
                </span>
              </div>

              {preview.app.description && (
                <p className="text-xs text-zinc-400 line-clamp-2">{preview.app.description}</p>
              )}

              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-mono">
                  Releases ({preview.releases.length})
                </p>
                <div className="max-h-40 overflow-y-auto divide-y divide-zinc-800 border border-zinc-800">
                  {preview.releases.length === 0 && (
                    <p className="text-xs text-zinc-500 p-2">No published releases yet.</p>
                  )}
                  {preview.releases.slice(0, 8).map((r) => (
                    <div key={r.tag} className="flex items-center justify-between px-2 py-1.5 text-[11px] font-mono">
                      <span className="text-zinc-200 truncate">{r.tag}</span>
                      <span className="text-zinc-500 ml-2 whitespace-nowrap">
                        {r.prerelease ? "pre-release" : "stable"}
                        {r.publishedAt ? ` · ${new Date(r.publishedAt).toLocaleDateString()}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-zinc-500">
                Install downloads the newest installer and runs it on this PC. Later releases appear here as updates.
              </p>
            </div>
          )}

          {added.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-mono">Added by you</p>
              <div className="divide-y divide-zinc-800 border border-zinc-800">
                {added.map((repo) => (
                  <div key={repo.id} className="flex items-center justify-between px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-200 truncate">{repo.name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate">{repo.github}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemoveRepo(repo.id)}
                      className="text-zinc-500 hover:text-destructive h-7 w-7"
                      title="Remove from Vault X"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-8">
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!preview || loading}
            className="text-xs h-8 bg-zinc-100 text-zinc-950 hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span>Add to Vault X</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
