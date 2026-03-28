// Shared lifecycle state for managed distributions (standalone, wallpaper).

let jobHandle = null;

export function setJobHandle(handle) {
  jobHandle = handle;
}

export function getJobHandle() {
  return jobHandle;
}
