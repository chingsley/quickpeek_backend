import firebaseAdmin from '../config/firebase';

// send FCM notification
export const sendNotification = async (deviceToken: string, payload: any) => {
  const message = {
    token: deviceToken,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data, // Any additional data I want to send to FE
  };

  try {
    const response = await firebaseAdmin.messaging().send(message);
    console.log('Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};
