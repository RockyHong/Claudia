// Shared lifecycle state for managed distributions (standalone).

let jobHandle = null;

export function setJobHandle(handle) {
  jobHandle = handle;
}

export function getJobHandle() {
  return jobHandle;
}
