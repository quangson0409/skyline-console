import apiClient from './client';

/**
 * OpenStack Glance Image Service API (v2)
 * Path: /api/openstack/regionone/glance/v2
 */
const BASE_PATH = '/openstack/regionone/glance/v2';

export const glanceApi = {
  listImages: (params) => apiClient.get(`${BASE_PATH}/images`, { params }),
  getImage: (id) => apiClient.get(`${BASE_PATH}/images/${id}`),
  createImage: (data) => apiClient.post(`${BASE_PATH}/images`, data),
  deleteImage: (id) => apiClient.delete(`${BASE_PATH}/images/${id}`),
};

export default glanceApi;
