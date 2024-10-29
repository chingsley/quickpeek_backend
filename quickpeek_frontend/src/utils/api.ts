import axios from 'axios';
import store from '../store';

const api = axios.create({
  baseURL: 'http://172.20.10.2:3000/api/v1', // TODO: update with backend url
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = store.getState().auth.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('\n:::::: token: ', token);
  console.log('\n:::::: config.headers.Authorization', config.headers.Authorization);
  return config;
}, (error) => {
  console.log('>> axios error: ', error);
  return Promise.reject(error);
});

export default api;
