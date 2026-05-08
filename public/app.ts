/**
 * musubi-s3 Web Console Application
 */

// Types
interface Bucket {
  name: string;
  creationDate: string;
}

interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

interface AppState {
  currentBucket: string | null;
  currentPrefix: string;
  buckets: Bucket[];
  objects: S3Object[];
}

// State
const state: AppState = {
  currentBucket: null,
  currentPrefix: "",
  buckets: [],
  objects: [],
};

// DOM Elements
const bucketListEl = document.getElementById("bucket-list") as HTMLDivElement;
const objectListEl = document.getElementById("object-list") as HTMLDivElement;
const breadcrumbEl = document.getElementById("breadcrumb") as HTMLDivElement;
const uploadBtn = document.getElementById("upload-btn") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh-btn") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const dropZoneOverlay = document.getElementById("drop-zone-overlay") as HTMLDivElement;
const dropZoneMessage = document.getElementById("drop-zone-message") as HTMLParagraphElement;
const modal = document.getElementById("modal") as HTMLDivElement;
const modalMessage = document.getElementById("modal-message") as HTMLParagraphElement;
const modalCancel = document.getElementById("modal-cancel") as HTMLButtonElement;
const modalConfirm = document.getElementById("modal-confirm") as HTMLButtonElement;

// API Client
class S3ApiClient {
  async listBuckets(): Promise<Bucket[]> {
    const response = await fetch("/");
    if (!response.ok) throw new Error(`Failed to list buckets: ${response.status}`);
    
    const xml = await response.text();
    return this.parseListBucketsXml(xml);
  }

  async listObjects(bucket: string, prefix: string = ""): Promise<S3Object[]> {
    const url = prefix 
      ? `/${bucket}?prefix=${encodeURIComponent(prefix)}`
      : `/${bucket}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to list objects: ${response.status}`);
    
    const xml = await response.text();
    return this.parseListObjectsXml(xml);
  }

  async uploadFile(bucket: string, key: string, file: File): Promise<void> {
    const response = await fetch(`/${bucket}/${key}`, {
      method: "PUT",
      body: file,
    });
    
    if (!response.ok) throw new Error(`Failed to upload: ${response.status}`);
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const response = await fetch(`/${bucket}/${key}`, {
      method: "DELETE",
    });
    
    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete: ${response.status}`);
    }
  }

  downloadObject(bucket: string, key: string): string {
    return `/${bucket}/${key}`;
  }

  private parseListBucketsXml(xml: string): Bucket[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const buckets: Bucket[] = [];
    
    const bucketElements = doc.getElementsByTagName("Bucket");
    for (let i = 0; i < bucketElements.length; i++) {
      const bucketEl = bucketElements[i];
      const nameEl = bucketEl.getElementsByTagName("Name")[0];
      const dateEl = bucketEl.getElementsByTagName("CreationDate")[0];
      
      if (nameEl) {
        buckets.push({
          name: nameEl.textContent || "",
          creationDate: dateEl?.textContent || "",
        });
      }
    }
    
    return buckets;
  }

  private parseListObjectsXml(xml: string): S3Object[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const objects: S3Object[] = [];
    
    const contentsElements = doc.getElementsByTagName("Contents");
    for (let i = 0; i < contentsElements.length; i++) {
      const contentEl = contentsElements[i];
      const keyEl = contentEl.getElementsByTagName("Key")[0];
      const sizeEl = contentEl.getElementsByTagName("Size")[0];
      const dateEl = contentEl.getElementsByTagName("LastModified")[0];
      
      if (keyEl) {
        objects.push({
          key: keyEl.textContent || "",
          size: parseInt(sizeEl?.textContent || "0", 10),
          lastModified: dateEl?.textContent || "",
        });
      }
    }
    
    return objects;
  }
}

const api = new S3ApiClient();

// UI Functions
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function showError(message: string) {
  const errorEl = document.createElement("div");
  errorEl.className = "error-message";
  errorEl.textContent = "❌ " + message;
  objectListEl.insertBefore(errorEl, objectListEl.firstChild);
  setTimeout(() => errorEl.remove(), 5000);
}

function showSuccess(message: string) {
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

  bucketListEl.innerHTML = state.buckets
    .map(
      (bucket) => `
      <div class="bucket-item ${state.currentBucket === bucket.name ? "active" : ""}" 
           data-bucket="${bucket.name}">
        ${bucket.name}
      </div>
    `
    )
    .join("");

  // Add click handlers
  bucketListEl.querySelectorAll(".bucket-item").forEach((el) => {
    el.addEventListener("click", () => {
      const bucketName = (el as HTMLElement).dataset.bucket!;
      selectBucket(bucketName);
    });
  });
}

async function selectBucket(bucketName: string) {
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

  // Add click handlers
  breadcrumbEl.querySelectorAll(".breadcrumb-item").forEach((el) => {
    el.addEventListener("click", () => {
      const prefix = (el as HTMLElement).dataset.prefix || "";
      navigateToPrefix(prefix);
    });
  });
}

async function navigateToPrefix(prefix: string) {
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

  // Group by "folders" (prefixes ending with /)
  const folders = new Map<string, number>();
  const files: S3Object[] = [];

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

  // Render folders
  for (const [folderName, count] of Array.from(folders.entries())) {
    const fullPrefix = state.currentPrefix + folderName;
    html += `
      <div class="object-item">
        <div class="object-name folder" data-prefix="${fullPrefix}">
          <span class="object-icon">📁</span>
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

  // Render files
  for (const obj of files) {
    const fileName = obj.key.split("/").pop() || obj.key;
    html += `
      <div class="object-item">
        <div class="object-name">
          <span class="object-icon">📄</span>
          <span>${fileName}</span>
        </div>
        <span class="object-size">${formatSize(obj.size)}</span>
        <span class="object-date">${formatDate(obj.lastModified)}</span>
        <div class="object-actions">
          <a href="${api.downloadObject(state.currentBucket!, obj.key)}" 
             class="btn btn-small" download>Download</a>
          <button class="btn btn-small btn-danger" data-key="${obj.key}">Delete</button>
        </div>
      </div>
    `;
  }

  objectListEl.innerHTML = html;

  // Add click handlers for folders
  objectListEl.querySelectorAll(".folder").forEach((el) => {
    el.addEventListener("click", () => {
      const prefix = (el as HTMLElement).dataset.prefix!;
      navigateToPrefix(prefix);
    });
  });

  // Add click handlers for folder open buttons
  objectListEl.querySelectorAll("[data-prefix]").forEach((el) => {
    if (el.tagName === "BUTTON") {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const prefix = (el as HTMLElement).dataset.prefix!;
        navigateToPrefix(prefix);
      });
    }
  });

  // Add click handlers for delete buttons
  objectListEl.querySelectorAll(".btn-danger").forEach((el) => {
    el.addEventListener("click", () => {
      const key = (el as HTMLElement).dataset.key!;
      confirmDelete(key);
    });
  });
}

async function uploadFiles(files: FileList) {
  if (!state.currentBucket) return;

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

function confirmDelete(key: string) {
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

// Event Listeners
uploadBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files) {
    uploadFiles(fileInput.files);
    fileInput.value = ""; // Reset
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

// Drag and drop - Full page overlay
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!e.dataTransfer) return;
  
  // Only show if dragging files
  if (e.dataTransfer.types.includes("Files")) {
    dropZoneOverlay.classList.remove("hidden");
    
    // Update message based on bucket selection
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
  // Only hide if leaving the window (not entering a child element)
  const rect = document.body.getBoundingClientRect();
  if (
    e.clientX < rect.left ||
    e.clientX >= rect.right ||
    e.clientY < rect.top ||
    e.clientY >= rect.bottom
  ) {
    dropZoneOverlay.classList.add("hidden");
  }
});

dropZoneOverlay.addEventListener("dragleave", (e) => {
  e.preventDefault();
  // Hide when leaving the overlay itself
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

// Prevent default drag behaviors on document
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  if (e.target !== dropZoneOverlay && !dropZoneOverlay.contains(e.target as Node)) {
    e.preventDefault();
  }
});

// Initialize
loadBuckets();
