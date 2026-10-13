import apiClient from './client';
import novaApi from './nova';
import glanceApi from './glance';
import cinderApi from './cinder';
import neutronApi from './neutron';
import keystoneApi from './keystone';
import skylineApi from './skyline';

export const client = {
  http: apiClient,
  nova: novaApi,
  glance: glanceApi,
  cinder: cinderApi,
  neutron: neutronApi,
  keystone: keystoneApi,
  skyline: skylineApi,
};

export {
  apiClient,
  novaApi,
  glanceApi,
  cinderApi,
  neutronApi,
  keystoneApi,
  skylineApi,
};

export default client;
