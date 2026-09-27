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
  revertChange: (mergeId, changeId) => call({ op: 'revertChange', mergeId, changeId }),
  setCurrencyMode: (mergeId, field, mode) => call({ op: 'setCurrencyMode', mergeId, field, mode }),
  undo: (mergeId) => call({ op: 'undo', mergeId }),
  redo: (mergeId) => call({ op: 'redo', mergeId }),
  writeMerge: (mergeId, name) => call({ op: 'writeMerge', mergeId, name }),
  closeMerge: (mergeId) => call({ op: 'closeMerge', mergeId }),
  openExplorer: (root, slot) => call({ op: 'openExplorer', root, slot }),
  explorerList: (explorerId, path) => call({ op: 'explorerList', explorerId, path }),
  explorerGetLeaf: (explorerId, path) => call({ op: 'explorerGetLeaf', explorerId, path }),
  explorerSetLeaf: (explorerId, path, kind, raw) => call({ op: 'explorerSetLeaf', explorerId, path, kind, raw }),
  explorerDuplicateItem: (explorerId, arrayPath, index) => call({ op: 'explorerDuplicateItem', explorerId, arrayPath, index }),
  explorerRemoveItem: (explorerId, arrayPath, index) => call({ op: 'explorerRemoveItem', explorerId, arrayPath, index }),
  explorerSearch: (explorerId, query) => call({ op: 'explorerSearch', explorerId, query }),
  explorerUndo: (explorerId) => call({ op: 'explorerUndo', explorerId }),
  explorerRedo: (explorerId) => call({ op: 'explorerRedo', explorerId }),
  writeExplorer: (explorerId) => call({ op: 'writeExplorer', explorerId }),
  closeExplorer: (explorerId) => call({ op: 'closeExplorer', explorerId }),
  survivalCheck: (root, mergedSlot, sourceSlot) => call({ op: 'survivalCheck', root, mergedSlot, sourceSlot }),
  inventoryContainers: (explorerId) => call({ op: 'inventoryContainers', explorerId }),
  inventoryOpen: (explorerId, containerKey) => call({ op: 'inventoryOpen', explorerId, containerKey }),
  inventorySetAmount: (explorerId, containerKey, arrayIndex, amount) => call({ op: 'inventorySetAmount', explorerId, containerKey, arrayIndex, amount }),
  inventorySetItem: (explorerId, containerKey, arrayIndex, itemId, amount) => call({ op: 'inventorySetItem', explorerId, containerKey, arrayIndex, itemId, amount }),
  inventoryFillSlot: (explorerId, containerKey, x, y, itemId, amount) => call({ op: 'inventoryFillSlot', explorerId, containerKey, x, y, itemId, amount }),
  inventoryClearSlot: (explorerId, containerKey, arrayIndex) => call({ op: 'inventoryClearSlot', explorerId, containerKey, arrayIndex }),
  itemSearch: (query) => call({ op: 'itemSearch', query }),
};

contextBridge.exposeInMainWorld('studio', api);
