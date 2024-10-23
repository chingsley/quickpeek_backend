import axios from 'axios';

export const createQuestion = async (questionData: any, token: string | null) => {
  const response = await axios.post(`/api/v1/questions`, questionData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};