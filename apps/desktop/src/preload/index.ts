import { contextBridge, ipcRenderer } from 'electron';
import { API_CHANNEL, type EngineRequest, type StudioApi } from '../shared/api.ts';

const call = (request: EngineRequest) => ipcRenderer.invoke(API_CHANNEL, request);

const api: StudioApi = {
  listRoots: () => call({ op: 'listRoots' }),
  listSlots: (root) => call({ op: 'listSlots', root }),
  overview: (root, slot) => call({ op: 'overview', root, slot }),
  gameRunning: () => call({ op: 'gameRunning' }),
};

contextBridge.exposeInMainWorld('studio', api);
