import axios from '../utils/api';  // Using configured axios instance

export const registerUser = async (userData: any) => {
  try {
    const response = await axios.post('/api/v1/users', userData);
    return response.data;
  } catch (error) {
    throw new Error('Error registering user');
  }
};

export const loginUser = async (credentials: any) => {
  try {
    const response = await axios.post('/api/v1/users/login', credentials);
    return response.data;
  } catch (error) {
    throw new Error('Error logging in');
  }
};
