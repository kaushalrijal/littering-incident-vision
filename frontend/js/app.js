/* Littering Detection System - dashboard frontend (vanilla JS). */

"use strict";

const state = {
  view: "upload",
  videos: [],
  incidents: [],
  statusFilter: "",
  videoFilter: null,
};

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* empty body */
  }
  if (!res.ok) {
    const detail = data && data.detail ? data.detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return data;
}

function toast(message, type = "info") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtTime(ms) {
  if (ms == null || isNaN(ms)) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function badge(status) {
  const label = String(status || "").replace(/_/g, " ");
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

/* ---------------------------------------------------------------- */
/* Views / navigation                                                */
/* ---------------------------------------------------------------- */
function setView(name) {
  state.view = name;
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === `view-${name}`);
  });
}

/* ---------------------------------------------------------------- */
/* Upload                                                            */
/* ---------------------------------------------------------------- */
function bindUpload() {
  const dz = document.getElementById("dropzone");
  const input = document.getElementById("file-input");
  const status = document.getElementById("upload-status");

  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
    })
  );
  dz.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) upload(file);
  });
  input.addEventListener("change", () => {
    if (input.files && input.files[0]) upload(input.files[0]);
    input.value = "";
  });

  async function upload(file) {
    status.classList.remove("hidden");
    status.innerHTML = `<strong>Uploading:</strong> ${escapeHtml(file.name)} …`;
    const form = new FormData();
    form.append("file", file);
    try {
      const video = await api("/api/videos", { method: "POST", body: form });
      status.innerHTML =
        `<strong>Uploaded.</strong> Video #${video.id} queued for processing — ` +
        `status: ${escapeHtml(video.status)}.`;
      toast(`Video #${video.id} uploaded`, "success");
      await refresh();
      setView("videos");
    } catch (err) {
      status.innerHTML = `<strong class="badge failed">Upload failed:</strong> ${escapeHtml(err.message)}`;
      toast(err.message, "error");
    }
  }
}

/* ---------------------------------------------------------------- */
/* Videos                                                            */
/* ---------------------------------------------------------------- */
async function renderVideos() {
  const wrap = document.getElementById("videos-list");
  if (!state.videos.length) {
    wrap.innerHTML = `<p class="muted">No videos yet. Upload one from the Upload tab.</p>`;
    return;
  }

  const rows = state.videos.map((v) => {
    const processing = v.status === "processing" || v.status === "pending";
    const pct =
      v.total_frames > 0
        ? Math.min(100, Math.round(((v.processed_frames || 0) / v.total_frames) * 100))
        : 0;
    const progress =
      processing && v.total_frames > 0
        ? `<div class="progress"><span style="width:${pct}%"></span></div>
           <span class="muted small">${v.processed_frames || 0}/${v.total_frames} frames</span>`
        : `<span class="muted small">${v.processed_frames || 0} frames</span>`;

    let actions = "";
    if (v.status === "processing") {
      actions = `<span class="muted small">processing…</span>`;
    } else if (v.status === "pending") {
      actions = `<button class="btn small" onclick="processVideo(${v.id}, false)">Process</button>`;
    } else if (v.status === "completed") {
      actions =
        `<button class="btn small ghost" onclick="viewVideo(${v.id})">View</button>` +
        `<button class="btn small gray" onclick="processVideo(${v.id}, true)">Reprocess</button>`;
    } else {
      actions = `<button class="btn small" onclick="processVideo(${v.id}, false)">Retry</button>`;
    }

    const error =
      v.status === "failed" && v.error
        ? `<div class="muted small" style="color:var(--red)">${escapeHtml(v.error)}</div>`
        : "";

    return `<tr>
      <td>#${v.id}</td>
      <td>${escapeHtml(v.filename)}</td>
      <td>${badge(v.status)}${error}</td>
      <td>${progress}</td>
      <td>${fmtTime(v.duration_ms)}</td>
      <td>${v.fps ? Math.round(v.fps) : "—"} fps</td>
      <td>${v.incident_count ?? 0}</td>
      <td>${escapeHtml(v.created_at)}</td>
      <td>${actions}</td>
    </tr>`;
  });

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>File</th><th>Status</th><th>Progress</th>
        <th>Duration</th><th>FPS</th><th>Incidents</th><th>Uploaded</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
}

async function processVideo(id, force) {
  try {
    await api(`/api/videos/${id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    toast(`Video #${id} queued`, "success");
    await refresh();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function viewVideo(id) {
  state.videoFilter = id;
  state.statusFilter = "";
  document.querySelectorAll(".chip[data-status]").forEach((c) => {
    c.classList.toggle("active", c.dataset.status === "");
  });
  setView("incidents");
  await refresh();
}

/* ---------------------------------------------------------------- */
/* Incidents                                                         */
/* ---------------------------------------------------------------- */
async function renderIncidents() {
  const grid = document.getElementById("incidents-grid");

  // Filter chip for "video #N"
  const filtersEl = document.getElementById("incident-filters");
  const existing = filtersEl.querySelector(".video-chip");
  if (existing) existing.remove();
  if (state.videoFilter != null) {
    const chip = document.createElement("button");
    chip.className = "chip active video-chip";
    chip.textContent = `video #${state.videoFilter} ✕`;
    chip.addEventListener("click", clearVideoFilter);
    filtersEl.appendChild(chip);
  }

  if (!state.incidents.length) {
    grid.innerHTML = `<p class="muted">No incidents yet. Process a video to generate them.</p>`;
    return;
  }

  const cards = state.incidents.map((inc) => {
    const thumb = inc.snapshot_path
      ? `<img src="/media/${encodeURI(inc.snapshot_path)}" alt="Incident snapshot" loading="lazy" />`
      : `<div class="thumb-placeholder">no snapshot</div>`;
    return `
      <div class="incident-card" onclick="openModal(${inc.id})">
        ${thumb}
        <div class="incident-body">
          <div class="row">
            <strong>#${inc.id} · ${fmtTime(inc.timestamp_ms)}</strong>
            ${badge(inc.review_status)}
          </div>
          <div class="row">
            <span class="muted small">${escapeHtml(inc.video_filename)}</span>
            <span class="muted small">${Math.round(inc.confidence * 100)}% conf</span>
          </div>
          <p class="reason">${escapeHtml(inc.reason)}</p>
        </div>
      </div>`;
  });
  grid.innerHTML = cards.join("");
}

async function clearVideoFilter() {
  state.videoFilter = null;
  const chip = document.querySelector(".video-chip");
  if (chip) chip.remove();
  await refresh();
}

/* ---------------------------------------------------------------- */
/* Modal / incident detail                                           */
/* ---------------------------------------------------------------- */
async function openModal(incidentId) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modal-body");
  modal.classList.remove("hidden");
  body.innerHTML = `<p class="muted">Loading…</p>`;

  try {
    const inc = await api(`/api/incidents/${incidentId}`);
    const srcPath = inc.video_file_path ? `/media/${encodeURI(inc.video_file_path)}` : null;
    const clipPath = inc.clip_path ? `/media/${encodeURI(inc.clip_path)}` : null;

    body.innerHTML = `
      <h2>Incident #${inc.id} ${badge(inc.review_status)}</h2>

      <div class="evidence">
        ${
          inc.snapshot_path
            ? `<img src="/media/${encodeURI(inc.snapshot_path)}" alt="Snapshot at event time" />`
            : `<p class="muted">No snapshot saved for this incident.</p>`
        }
        ${
          srcPath
            ? `<h3>Source video</h3>
               <video id="source-video" controls preload="metadata" src="${srcPath}"></video>`
            : ""
        }
        ${
          clipPath
            ? `<h3>Evidence clip (${fmtTime(inc.timestamp_ms)} in source)</h3>
               <video controls preload="metadata" src="${clipPath}"></video>
               <a class="btn ghost small" href="${clipPath}" download>Download clip</a>`
            : `<p class="muted">No evidence clip saved for this incident.</p>`
        }
      </div>

      <dl class="meta">
        <dt>Video</dt><dd>#${inc.video_id} — ${escapeHtml(inc.video_filename)}</dd>
        <dt>Event time</dt><dd>${fmtTime(inc.timestamp_ms)}</dd>
        <dt>Confidence</dt><dd>${Math.round(inc.confidence * 100)}%</dd>
        <dt>Waste class</dt><dd>${escapeHtml(inc.class_names || "—")}</dd>
        <dt>Track ID</dt><dd>${inc.track_id ?? "—"}</dd>
        <dt>Reason</dt><dd>${escapeHtml(inc.reason || "—")}</dd>
        <dt>Review status</dt><dd>${escapeHtml(inc.review_status)}</dd>
        <dt>Recorded</dt><dd>${escapeHtml(inc.created_at)}</dd>
      </dl>

      <div class="actions">
        ${
          srcPath
            ? `<button class="btn small ghost" onclick="jumpToEvent()">Jump to event time</button>`
            : ""
        }
        <button class="btn small green" onclick="setStatus(${inc.id}, 'confirmed')">Confirm</button>
        <button class="btn small red" onclick="setStatus(${inc.id}, 'false_alarm')">False alarm</button>
        <button class="btn small gray" onclick="setStatus(${inc.id}, 'pending')">Mark pending</button>
      </div>`;

    // Keep the event time on the modal for the jump button.
    modal.dataset.eventMs = inc.timestamp_ms;
  } catch (err) {
    body.innerHTML = `<p class="muted">Failed to load incident: ${escapeHtml(err.message)}</p>`;
  }
}

function jumpToEvent() {
  const modal = document.getElementById("modal");
  const video = document.getElementById("source-video");
  if (!video) return;
  const ms = Number(modal.dataset.eventMs || 0);
  video.currentTime = ms / 1000;
  video.play().catch(() => {});
}

async function setStatus(incidentId, status) {
  try {
    const updated = await api(`/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_status: status }),
    });
    toast(`Incident #${incidentId} → ${updated.review_status}`, "success");
    await refresh();
    openModal(incidentId);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------------------------------------------------------------- */
/* Refresh / polling                                                 */
/* ---------------------------------------------------------------- */
async function refresh() {
  try {
    const [videos, incidents] = await Promise.all([
      api("/api/videos"),
      api(
        `/api/incidents?${new URLSearchParams({
          ...(state.statusFilter ? { status: state.statusFilter } : {}),
          ...(state.videoFilter != null ? { video_id: String(state.videoFilter) } : {}),
        })}`
      ),
    ]);
    state.videos = videos;
    state.incidents = incidents;
  } catch (err) {
    toast(err.message, "error");
    return;
  }

  if (state.view === "videos") renderVideos();
  if (state.view === "incidents") renderIncidents();
  if (state.view === "upload") {
    // Show a small live hint on the upload page when something is processing.
    const processing = state.videos.filter(
      (v) => v.status === "processing" || v.status === "pending"
    );
    const hint = document.getElementById("upload-status");
    if (processing.length && hint) {
      hint.classList.remove("hidden");
      hint.innerHTML = `<strong>Processing:</strong> ${processing.length} video(s) in the queue — see the Videos tab.`;
    }
  }
}

function bindGlobal() {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => setView(b.dataset.view));
  });
  document.getElementById("refresh-videos").addEventListener("click", refresh);

  document.querySelectorAll("#incident-filters .chip[data-status]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.statusFilter = chip.dataset.status;
      document.querySelectorAll("#incident-filters .chip[data-status]").forEach((c) => {
        c.classList.toggle("active", c.dataset.status === state.statusFilter);
      });
      refresh();
    });
  });

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => document.getElementById("modal").classList.add("hidden"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.getElementById("modal").classList.add("hidden");
  });
}

/* ---------------------------------------------------------------- */
/* Boot                                                              */
/* ---------------------------------------------------------------- */
(async function init() {
  bindUpload();
  bindGlobal();
  setView("upload");
  await refresh();
  setInterval(refresh, 2500);
})();
