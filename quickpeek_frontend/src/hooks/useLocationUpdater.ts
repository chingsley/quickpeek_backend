import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLocation } from '../store/slices/permissionsSlice';
import { calculateDistance } from '../utils/geo';

const LOCATION_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const LOCATION_THRESHOLD = 0.1; // Minimum distance in km to trigger an update

export const useLocationUpdater = () => {
  const dispatch = useDispatch();
  const { locationSharingEnabled } = useSelector((state: RootState) => state.permissions);
  const { isLoggedIn } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    const updateLocation = async () => {
      try {
        if (!isLoggedIn || !locationSharingEnabled) return;

        const updatedLocation = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = updatedLocation.coords;

        // Retrieve previous location from AsyncStorage for distance calculation
        const prevLocation = await AsyncStorage.getItem('previousLocation');
        if (prevLocation) {
          const { latitude: prevLat, longitude: prevLon } = JSON.parse(prevLocation);
          const distance = calculateDistance(prevLat, prevLon, latitude, longitude);
          if (distance < LOCATION_THRESHOLD) return; // Skip update if within the threshold
        }

        // Update Redux store and cache with the new location
        dispatch(setLocation({ latitude, longitude }));
        await AsyncStorage.setItem('previousLocation', JSON.stringify({ latitude, longitude }));

        // Send updated location to the server
        await fetch('/api/v1/users/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ latitude, longitude }),
        });
      } catch (error) {
        console.error('Failed to update location:', error);
      }
    };

    // Set interval to update location
    const intervalId = setInterval(updateLocation, LOCATION_UPDATE_INTERVAL);

    return () => clearInterval(intervalId); // Clean up on unmount
  }, [isLoggedIn, locationSharingEnabled, dispatch]);
};
