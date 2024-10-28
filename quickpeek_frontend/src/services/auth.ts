import axios from '../utils/api';  // Using configured axios instance

export const registerUser = async (userData: any) => {
  try {
    const response = await axios.post('/users', userData);
    return response.data;
  } catch (error) {
    console.log('\n.......... error: ', error, error.response?.data);
    throw error;
  }
};

export const loginUser = async (credentials: any) => {
  try {
    const response = await axios.post('/users/login', credentials);
    return response.data;
  } catch (error) {
    throw error;
  }
};
