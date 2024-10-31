import { useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import Constants from 'expo-constants';
import { setNotificationToken, setLocation } from '../store/slices/permissionsSlice';

const NOTIF_TOKEN_KEY = 'notificationToken';
const LOCATION_KEY = 'location';

export const usePermissions = () => {
  const dispatch = useDispatch();

  const registerForPushNotificationsAsync = useCallback(async () => {
    const savedToken = await AsyncStorage.getItem(NOTIF_TOKEN_KEY);
    if (savedToken) {
      dispatch(setNotificationToken(savedToken));
      return;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      })).data;

      dispatch(setNotificationToken(token));
      await AsyncStorage.setItem(NOTIF_TOKEN_KEY, token);
    } else {
      alert('Failed to get push token for notifications!');
    }
  }, [dispatch]);

  const askLocationPermission = useCallback(async () => {
    const savedLocation = await AsyncStorage.getItem(LOCATION_KEY);
    if (savedLocation) {
      const locationData = JSON.parse(savedLocation);
      dispatch(setLocation(locationData));
      return locationData;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({});
      const locationData = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      dispatch(setLocation(locationData));
      await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(locationData));
      return locationData;
    } else {
      alert('Location permission not granted!');
      return null;
    }
  }, [dispatch]);

  useEffect(() => {
    registerForPushNotificationsAsync();
    askLocationPermission();
  }, [registerForPushNotificationsAsync, askLocationPermission]);
};
