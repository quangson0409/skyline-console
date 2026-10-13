import apiClient from './client';
import { serviceBase } from './endpoints';

/**
 * OpenStack Masakari (Instance-HA) API v1 - port of legacy src/client/masakari.
 * Resources: segments (+ sub resource hosts), notifications.
 * Base path is resolved per call from the service catalog (serviceBase('masakari')).
 */
const base = () => serviceBase('masakari');

export const masakariApi = {
  // Failover segments
  listSegments: (params) => apiClient.get(`${base()}/segments`, { params }),
  getSegment: (id) => apiClient.get(`${base()}/segments/${id}`),
  createSegment: (body) => apiClient.post(`${base()}/segments`, body),
  updateSegment: (id, body) => apiClient.put(`${base()}/segments/${id}`, body),
  deleteSegment: (id) => apiClient.delete(`${base()}/segments/${id}`),

  // Hosts (sub resource of a segment)
  listHosts: (segmentId, params) => apiClient.get(`${base()}/segments/${segmentId}/hosts`, { params }),
  getHost: (segmentId, hostId) => apiClient.get(`${base()}/segments/${segmentId}/hosts/${hostId}`),
  createHost: (segmentId, body) => apiClient.post(`${base()}/segments/${segmentId}/hosts`, body),
  updateHost: (segmentId, hostId, body) =>
    apiClient.put(`${base()}/segments/${segmentId}/hosts/${hostId}`, body),
  deleteHost: (segmentId, hostId) => apiClient.delete(`${base()}/segments/${segmentId}/hosts/${hostId}`),

  // Notifications
  listNotifications: (params) => apiClient.get(`${base()}/notifications`, { params }),
  getNotification: (id) => apiClient.get(`${base()}/notifications/${id}`),
  createNotification: (body) => apiClient.post(`${base()}/notifications`, body),
};

export default masakariApi;
