import { useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import Constants from 'expo-constants';
import { setNotificationToken, setLocationSharingEnabled } from '../store/slices/permissionsSlice';

const NOTIF_TOKEN_KEY = 'notificationToken';
const LOCATION_PERMISSION_KEY = 'locationpermissionkey';
const QUICK_PEEK_PERMISSIONS_KEY = 'quickpeekpermissionskey';

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
    const savedLocationSetting = await AsyncStorage.getItem(LOCATION_PERMISSION_KEY);
    if (savedLocationSetting) {
      const value = JSON.parse(savedLocationSetting);
      dispatch(setLocationSharingEnabled(value));
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      dispatch(setLocationSharingEnabled(true));
      await AsyncStorage.setItem(LOCATION_PERMISSION_KEY, JSON.stringify(true));
      return;
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
