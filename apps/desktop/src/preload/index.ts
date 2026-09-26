import { contextBridge, ipcRenderer } from 'electron';
import { API_CHANNEL, type EngineRequest, type StudioApi } from '../shared/api.ts';

const call = (request: EngineRequest) => ipcRenderer.invoke(API_CHANNEL, request);

const api: StudioApi = {
  listRoots: () => call({ op: 'listRoots' }),
  listSlots: (root) => call({ op: 'listSlots', root }),
  overview: (root, slot) => call({ op: 'overview', root, slot }),
  gameRunning: () => call({ op: 'gameRunning' }),
  openMerge: (root, targetSlot, sourceSlot) => call({ op: 'openMerge', root, targetSlot, sourceSlot }),
  applyChanges: (mergeId, changeIds) => call({ op: 'applyChanges', mergeId, changeIds }),
  undo: (mergeId) => call({ op: 'undo', mergeId }),
  redo: (mergeId) => call({ op: 'redo', mergeId }),
  writeMerge: (mergeId, name) => call({ op: 'writeMerge', mergeId, name }),
  closeMerge: (mergeId) => call({ op: 'closeMerge', mergeId }),
};

contextBridge.exposeInMainWorld('studio', api);
