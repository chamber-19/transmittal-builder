const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken() {
  return sessionStorage.getItem('auth_token')
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body)
    } catch {
      detail = await res.text() || detail
    }
    const err = new Error(detail)
    err.status = res.status
    throw err
  }
  return res
}

async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options)
  return res.json()
}

export async function getHealth() {
  return apiJson('/api/health')
}

export async function getMe() {
  return apiJson('/api/auth/me')
}

export async function browseDir(path = '') {
  const params = new URLSearchParams()
  if (path) params.append('path', path)
  return apiJson(`/api/browse${path ? `?${params}` : ''}`)
}

export async function scanProjects(root, query = '') {
  const params = new URLSearchParams({ root })
  if (query) params.append('query', query)
  return apiJson(`/api/scan-projects?${params}`)
}

export async function scanFolder(folderPath) {
  return apiJson('/api/scan-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath }),
  })
}

export async function parseIndex(file) {
  const form = new FormData()
  form.append('file', file)
  return apiJson('/api/parse-index', { method: 'POST', body: form })
}

export async function renderToFolder({
  fields,
  checks,
  contacts,
  documents,
  outputDir,
  pdfs = [],
}) {
  const form = new FormData()
  form.append('fields', JSON.stringify(fields))
  form.append('checks', JSON.stringify(checks))
  form.append('contacts', JSON.stringify(contacts))
  form.append('documents', JSON.stringify(documents))
  form.append('output_dir', outputDir)
  form.append('local_pdf_paths', '[]')
  for (const pdf of pdfs) {
    form.append('pdfs', pdf)
  }
  return apiJson('/api/render-to-folder', { method: 'POST', body: form })
}

export async function zipFolder(folderPath) {
  return apiFetch('/api/zip-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath }),
  })
}

export async function updateProfile({ display_name }) {
  return apiJson('/api/auth/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name }),
  })
}

export async function removeRecentProject(path) {
  return apiJson('/api/projects/recent', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),   // backend now reads JSON body
  })
}

// ── Contact groups (address book) ──────────────────────────

export async function getContactGroups() {
  return apiJson('/api/contacts/groups')
}

export async function saveContactGroup({ company_name, contacts }) {
  return apiJson('/api/contacts/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name, contacts }),
  })
}

export async function deleteContactGroup(group_id) {
  return apiJson('/api/contacts/groups', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_id }),
  })
}

// ── Transmittal history + duplicate detection ───────────────

export async function getTransmittalHistory(projectPath) {
  return apiJson('/api/projects/transmittals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_path: projectPath }),
  })
}

export async function checkDuplicateDrawings(projectPath, docNos) {
  return apiJson('/api/drawings/check-duplicates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_path: projectPath, doc_nos: docNos }),
  })
}

export async function getRecentProjects() {
  return apiJson('/api/projects/recent')
}

export async function touchProject({ path, job_num = '', client_site = '', next_xmtl_num = '' }) {
  return apiJson('/api/projects/touch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, job_num, client_site, next_xmtl_num }),
  })
}

export async function renderZip({
  template,
  fields,
  checks,
  contacts,
  documents,
  pdfs = [],
}) {
  const form = new FormData()
  form.append('template', template)
  form.append('fields', JSON.stringify(fields))
  form.append('checks', JSON.stringify(checks))
  form.append('contacts', JSON.stringify(contacts))
  form.append('documents', JSON.stringify(documents))
  for (const pdf of pdfs) {
    form.append('pdfs', pdf)
  }
  return apiFetch('/api/render', { method: 'POST', body: form })
}
