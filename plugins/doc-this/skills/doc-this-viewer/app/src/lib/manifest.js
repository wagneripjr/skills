// Data access. The manifest sits beside index.html (.doc-this/viewer/); doc files are
// fetched by absolute path from the server's document root (the project root).

export async function loadManifest() {
  const res = await fetch('./viewer-manifest.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`manifest fetch failed (${res.status})`)
  return res.json()
}

export async function fetchText(path) {
  const res = await fetch('/' + path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`could not load ${path} (${res.status})`)
  return res.text()
}

export async function fetchJSON(path) {
  const res = await fetch('/' + path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`could not load ${path} (${res.status})`)
  return res.json()
}
