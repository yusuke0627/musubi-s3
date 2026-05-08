// public/app.ts
var state = {
  currentBucket: null,
  currentPrefix: "",
  buckets: [],
  objects: []
};
var bucketListEl = document.getElementById("bucket-list");
var objectListEl = document.getElementById("object-list");
var breadcrumbEl = document.getElementById("breadcrumb");
var uploadBtn = document.getElementById("upload-btn");
var refreshBtn = document.getElementById("refresh-btn");
var fileInput = document.getElementById("file-input");
var dropZoneOverlay = document.getElementById("drop-zone-overlay");
var dropZoneMessage = document.getElementById("drop-zone-message");
var modal = document.getElementById("modal");
var modalMessage = document.getElementById("modal-message");
var modalCancel = document.getElementById("modal-cancel");
var modalConfirm = document.getElementById("modal-confirm");
var createBucketBtn = document.getElementById("create-bucket-btn");
var createBucketModal = document.getElementById("create-bucket-modal");
var bucketNameInput = document.getElementById("bucket-name-input");
var bucketNameError = document.getElementById("bucket-name-error");
var createBucketCancel = document.getElementById("create-bucket-cancel");
var createBucketConfirm = document.getElementById("create-bucket-confirm");

class S3ApiClient {
  async listBuckets() {
    const response = await fetch("/");
    if (!response.ok)
      throw new Error(`Failed to list buckets: ${response.status}`);
    const xml = await response.text();
    return this.parseListBucketsXml(xml);
  }
  async listObjects(bucket, prefix = "") {
    const url = prefix ? `/${bucket}?prefix=${encodeURIComponent(prefix)}` : `/${bucket}`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to list objects: ${response.status}`);
    const xml = await response.text();
    return this.parseListObjectsXml(xml);
  }
  async uploadFile(bucket, key, file) {
    const response = await fetch(`/${bucket}/${key}`, {
      method: "PUT",
      body: file
    });
    if (!response.ok)
      throw new Error(`Failed to upload: ${response.status}`);
  }
  async deleteObject(bucket, key) {
    const response = await fetch(`/${bucket}/${key}`, {
      method: "DELETE"
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete: ${response.status}`);
    }
  }
  async createBucket(bucket) {
    const response = await fetch(`/${bucket}`, {
      method: "PUT"
    });
    if (!response.ok) {
      const xml = await response.text();
      throw new Error(`Failed to create bucket: ${response.status} - ${xml}`);
    }
  }
  downloadObject(bucket, key) {
    return `/${bucket}/${key}`;
  }
  parseListBucketsXml(xml) {
    const parser = new DOMParser;
    const doc = parser.parseFromString(xml, "text/xml");
    const buckets = [];
    const bucketElements = doc.getElementsByTagName("Bucket");
    for (let i = 0;i < bucketElements.length; i++) {
      const bucketEl = bucketElements[i];
      const nameEl = bucketEl.getElementsByTagName("Name")[0];
      const dateEl = bucketEl.getElementsByTagName("CreationDate")[0];
      if (nameEl) {
        buckets.push({
          name: nameEl.textContent || "",
          creationDate: dateEl?.textContent || ""
        });
      }
    }
    return buckets;
  }
  parseListObjectsXml(xml) {
    const parser = new DOMParser;
    const doc = parser.parseFromString(xml, "text/xml");
    const objects = [];
    const contentsElements = doc.getElementsByTagName("Contents");
    for (let i = 0;i < contentsElements.length; i++) {
      const contentEl = contentsElements[i];
      const keyEl = contentEl.getElementsByTagName("Key")[0];
      const sizeEl = contentEl.getElementsByTagName("Size")[0];
      const dateEl = contentEl.getElementsByTagName("LastModified")[0];
      if (keyEl) {
        const encodedKey = keyEl.textContent || "";
        objects.push({
          key: decodeURIComponent(encodedKey),
          size: parseInt(sizeEl?.textContent || "0", 10),
          lastModified: dateEl?.textContent || ""
        });
      }
    }
    return objects;
  }
}
var api = new S3ApiClient;
function formatSize(bytes) {
  if (bytes === 0)
    return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString();
}
function showError(message) {
  const errorEl = document.createElement("div");
  errorEl.className = "error-message";
  errorEl.textContent = "❌ " + message;
  objectListEl.insertBefore(errorEl, objectListEl.firstChild);
  setTimeout(() => errorEl.remove(), 5000);
}
function showSuccess(message) {
  const successEl = document.createElement("div");
  successEl.className = "success-message";
  successEl.textContent = "✅ " + message;
  objectListEl.insertBefore(successEl, objectListEl.firstChild);
  setTimeout(() => successEl.remove(), 3000);
}
async function loadBuckets() {
  try {
    bucketListEl.innerHTML = '<div class="loading">Loading...</div>';
    state.buckets = await api.listBuckets();
    renderBuckets();
  } catch (error) {
    bucketListEl.innerHTML = '<div class="error">Failed to load buckets</div>';
    console.error(error);
  }
}
function renderBuckets() {
  if (state.buckets.length === 0) {
    bucketListEl.innerHTML = '<div class="empty">No buckets</div>';
    return;
  }
  bucketListEl.innerHTML = state.buckets.map((bucket) => `
      <div class="bucket-item ${state.currentBucket === bucket.name ? "active" : ""}" 
           data-bucket="${bucket.name}">
        ${bucket.name}
      </div>
    `).join("");
  bucketListEl.querySelectorAll(".bucket-item").forEach((el) => {
    el.addEventListener("click", () => {
      const bucketName = el.dataset.bucket;
      selectBucket(bucketName);
    });
  });
}
async function selectBucket(bucketName) {
  state.currentBucket = bucketName;
  state.currentPrefix = "";
  renderBuckets();
  renderBreadcrumb();
  await loadObjects();
  uploadBtn.disabled = false;
}
function renderBreadcrumb() {
  if (!state.currentBucket) {
    breadcrumbEl.innerHTML = '<span class="breadcrumb-root">Select a bucket</span>';
    return;
  }
  let html = `<span class="breadcrumb-item" data-prefix="">${state.currentBucket}</span>`;
  if (state.currentPrefix) {
    const parts = state.currentPrefix.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
      currentPath += part + "/";
      html += `<span class="breadcrumb-separator"></span>`;
      html += `<span class="breadcrumb-item" data-prefix="${currentPath}">${part}</span>`;
    }
  }
  breadcrumbEl.innerHTML = html;
  breadcrumbEl.querySelectorAll(".breadcrumb-item").forEach((el) => {
    el.addEventListener("click", () => {
      const prefix = el.dataset.prefix || "";
      navigateToPrefix(prefix);
    });
  });
}
async function navigateToPrefix(prefix) {
  state.currentPrefix = prefix;
  renderBreadcrumb();
  await loadObjects();
}
async function loadObjects() {
  if (!state.currentBucket) {
    objectListEl.innerHTML = `
      <div class="empty-state">
        <p>Select a bucket to view objects</p>
      </div>
    `;
    return;
  }
  try {
    objectListEl.innerHTML = '<div class="loading">Loading...</div>';
    state.objects = await api.listObjects(state.currentBucket, state.currentPrefix);
    renderObjects();
  } catch (error) {
    objectListEl.innerHTML = '<div class="error">Failed to load objects</div>';
    console.error(error);
  }
}
function renderObjects() {
  if (state.objects.length === 0) {
    objectListEl.innerHTML = `
      <div class="empty-state">
        <p>No objects in this location</p>
      </div>
    `;
    return;
  }
  const folders = new Map;
  const files = [];
  for (const obj of state.objects) {
    const relativeKey = obj.key.slice(state.currentPrefix.length);
    const slashIndex = relativeKey.indexOf("/");
    if (slashIndex > 0) {
      const folderName = relativeKey.slice(0, slashIndex + 1);
      folders.set(folderName, (folders.get(folderName) || 0) + 1);
    } else {
      files.push(obj);
    }
  }
  let html = `
    <div class="object-list-header">
      <span>Name</span>
      <span>Size</span>
      <span>Last Modified</span>
      <span>Actions</span>
    </div>
  `;
  for (const [folderName, count] of Array.from(folders.entries())) {
    const fullPrefix = state.currentPrefix + folderName;
    html += `
      <div class="object-item">
        <div class="object-name folder" data-prefix="${fullPrefix}">
          <span class="object-icon">\uD83D\uDCC1</span>
          <span>${folderName}</span>
          <span style="color: #999; font-size: 12px;">(${count} items)</span>
        </div>
        <span class="object-size">-</span>
        <span class="object-date">-</span>
        <span class="object-actions">
          <button class="btn btn-small" data-prefix="${fullPrefix}">Open</button>
        </span>
      </div>
    `;
  }
  for (const obj of files) {
    const fileName = obj.key.split("/").pop() || obj.key;
    html += `
      <div class="object-item">
        <div class="object-name">
          <span class="object-icon">\uD83D\uDCC4</span>
          <span>${fileName}</span>
        </div>
        <span class="object-size">${formatSize(obj.size)}</span>
        <span class="object-date">${formatDate(obj.lastModified)}</span>
        <div class="object-actions">
          <a href="${api.downloadObject(state.currentBucket, obj.key)}" 
             class="btn btn-small" download>Download</a>
          <button class="btn btn-small btn-danger" data-key="${obj.key}">Delete</button>
        </div>
      </div>
    `;
  }
  objectListEl.innerHTML = html;
  objectListEl.querySelectorAll(".folder").forEach((el) => {
    el.addEventListener("click", () => {
      const prefix = el.dataset.prefix;
      navigateToPrefix(prefix);
    });
  });
  objectListEl.querySelectorAll("[data-prefix]").forEach((el) => {
    if (el.tagName === "BUTTON") {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const prefix = el.dataset.prefix;
        navigateToPrefix(prefix);
      });
    }
  });
  objectListEl.querySelectorAll(".btn-danger").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.key;
      confirmDelete(key);
    });
  });
}
async function uploadFiles(files) {
  if (!state.currentBucket)
    return;
  for (const file of Array.from(files)) {
    const key = state.currentPrefix + file.name;
    try {
      await api.uploadFile(state.currentBucket, key, file);
      showSuccess(`Uploaded ${file.name}`);
    } catch (error) {
      showError(`Failed to upload ${file.name}`);
      console.error(error);
    }
  }
  await loadObjects();
}
function confirmDelete(key) {
  modalMessage.textContent = `Are you sure you want to delete "${key.split("/").pop()}"?`;
  modal.classList.remove("hidden");
  const confirmHandler = async () => {
    modal.classList.add("hidden");
    modalConfirm.removeEventListener("click", confirmHandler);
    if (state.currentBucket) {
      try {
        await api.deleteObject(state.currentBucket, key);
        showSuccess("Deleted successfully");
        await loadObjects();
      } catch (error) {
        showError("Failed to delete");
        console.error(error);
      }
    }
  };
  modalConfirm.addEventListener("click", confirmHandler);
}
uploadBtn.addEventListener("click", () => {
  fileInput.click();
});
fileInput.addEventListener("change", () => {
  if (fileInput.files) {
    uploadFiles(fileInput.files);
    fileInput.value = "";
  }
});
refreshBtn.addEventListener("click", () => {
  loadBuckets();
  if (state.currentBucket) {
    loadObjects();
  }
});
modalCancel.addEventListener("click", () => {
  modal.classList.add("hidden");
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!e.dataTransfer)
    return;
  if (e.dataTransfer.types.includes("Files")) {
    dropZoneOverlay.classList.remove("hidden");
    if (!state.currentBucket) {
      dropZoneOverlay.classList.add("disabled");
      dropZoneMessage.textContent = "Select a bucket first to upload files";
    } else {
      dropZoneOverlay.classList.remove("disabled");
      dropZoneMessage.textContent = `Uploading to: ${state.currentBucket}`;
    }
  }
});
window.addEventListener("dragleave", (e) => {
  const rect = document.body.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
    dropZoneOverlay.classList.add("hidden");
  }
});
dropZoneOverlay.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (e.target === dropZoneOverlay) {
    dropZoneOverlay.classList.add("hidden");
  }
});
dropZoneOverlay.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZoneOverlay.classList.add("hidden");
  if (e.dataTransfer?.files && state.currentBucket) {
    uploadFiles(e.dataTransfer.files);
  } else if (e.dataTransfer?.files && !state.currentBucket) {
    showError("Please select a bucket first before uploading files");
  }
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  if (e.target !== dropZoneOverlay && !dropZoneOverlay.contains(e.target)) {
    e.preventDefault();
  }
});
function openCreateBucketModal() {
  bucketNameInput.value = "";
  bucketNameError.classList.add("hidden");
  bucketNameError.textContent = "";
  createBucketModal.classList.remove("hidden");
  bucketNameInput.focus();
}
function closeCreateBucketModal() {
  createBucketModal.classList.add("hidden");
}
function validateBucketName(name) {
  if (name.length < 3 || name.length > 63) {
    return "Bucket name must be between 3 and 63 characters";
  }
  if (!/^[a-z0-9]/.test(name)) {
    return "Bucket name must start with a lowercase letter or number";
  }
  if (!/[a-z0-9]$/.test(name)) {
    return "Bucket name must end with a lowercase letter or number";
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) {
    return "Bucket name can only contain lowercase letters, numbers, hyphens, and dots";
  }
  if (/\.\./.test(name)) {
    return "Bucket name cannot contain consecutive periods";
  }
  if (/\d+\.\d+\.\d+\.\d+/.test(name)) {
    return "Bucket name cannot be formatted as an IP address";
  }
  return null;
}
async function submitCreateBucket() {
  const name = bucketNameInput.value.trim();
  const error = validateBucketName(name);
  if (error) {
    bucketNameError.textContent = error;
    bucketNameError.classList.remove("hidden");
    return;
  }
  try {
    await api.createBucket(name);
    closeCreateBucketModal();
    showSuccess(`Bucket "${name}" created successfully`);
    await loadBuckets();
    selectBucket(name);
  } catch (err) {
    bucketNameError.textContent = err.message || "Failed to create bucket";
    bucketNameError.classList.remove("hidden");
  }
}
createBucketBtn.addEventListener("click", openCreateBucketModal);
createBucketCancel.addEventListener("click", closeCreateBucketModal);
createBucketConfirm.addEventListener("click", submitCreateBucket);
bucketNameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    submitCreateBucket();
  }
});
createBucketModal.addEventListener("click", (e) => {
  if (e.target === createBucketModal) {
    closeCreateBucketModal();
  }
});
loadBuckets();
