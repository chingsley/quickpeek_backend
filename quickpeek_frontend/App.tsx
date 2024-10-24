// App.tsx
import React, { useEffect } from 'react';
// import { NavigationContainer } from '@react-navigation/native';
// import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import AppNavigator from './src/navigation/AppNavigator'; // Navigation setup
import { Provider } from 'react-redux';
import store from './src/store';

const App = () => {
  useEffect(() => {
    registerForPushNotificationsAsync();
    askLocationPermission();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      alert('Failed to get push token for notifications!');
      return;
    }
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Device token:', token);
  };

  const askLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      alert('Location permission not granted!');
      return;
    }
    const location = await Location.getCurrentPositionAsync({});
    console.log('Location:', location);
  };

  return (
    <Provider store={store}>
      {/* <NavigationContainer> */}
      {/* <StatusBar style="auto" /> */}
      <AppNavigator />
      {/* </NavigationContainer> */}
    </Provider>
  );
};

export default App;
