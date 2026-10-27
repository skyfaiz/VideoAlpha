import axios from 'axios';

const BASE = 'http://localhost:8000/api';

export const submitInfinitetalk = (formData) =>
  axios.post(`${BASE}/infinitetalk/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const getInfinitetalkStatus = (jobId) =>
  axios.get(`${BASE}/infinitetalk/status/${jobId}`);

export const getInfinitetalkDownloadUrl = (jobId, customName = null) => {
  const url = `${BASE}/infinitetalk/download/${jobId}`;
  return customName ? `${url}?custom_name=${encodeURIComponent(customName)}` : url;
};

export const submitWanAnimate = (formData) =>
  axios.post(`${BASE}/wananimate/submit`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const getWanAnimateStatus = (jobId) =>
  axios.get(`${BASE}/wananimate/status/${jobId}`);

export const getWanAnimateDownloadUrl = (jobId, customName = null) => {
  const url = `${BASE}/wananimate/download/${jobId}`;
  return customName ? `${url}?custom_name=${encodeURIComponent(customName)}` : url;
};
