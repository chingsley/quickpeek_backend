// src/hooks/useLocationUpdater.ts
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import * as Location from 'expo-location';

const LOCATION_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export const useLocationUpdater = () => {
  const location = useSelector((state: RootState) => state.permissions.location);

  useEffect(() => {
    if (location) {
      const intervalId = setInterval(async () => {
        try {
          const updatedLocation = await Location.getCurrentPositionAsync({});
          await fetch('/api/v1/users/location', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              latitude: updatedLocation.coords.latitude,
              longitude: updatedLocation.coords.longitude,
            }),
          });
        } catch (error) {
          console.error('Failed to update location:', error);
        }
      }, LOCATION_UPDATE_INTERVAL);

      return () => clearInterval(intervalId);
    }
  }, [location]);
};
