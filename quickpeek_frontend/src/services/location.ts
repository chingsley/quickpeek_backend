import axios from '../utils/api';  // Using configured axios instance

export const updateUserLocation = async (payload: any) => {
  try {
    const response = await axios.post('/users/location', payload);
    return response.data;
  } catch (error) {
    throw error;
  }
};