import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import * as Location from 'expo-location';
import { calculateHaversineDistance } from '../utils/geo';
import { updateUserLocation } from '../services/location';
import { updateUserObjectLocation } from '../store/slices/authSlice';

const LOCATION_UPDATE_INTERVAL = 5 * 60 * 1000; // every 5 minutes
const LOCATION_THRESHOLD = 0.1; // Minimum distance in km to trigger an update (update this value appropriately later)

export const useLocationUpdater = () => {
  const dispatch = useDispatch();
  const { locationSharingEnabled } = useSelector((state: RootState) => state.permissions);
  const { isLoggedIn, user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    const updateLocation = async () => {
      console.log('\n\nStart: updateLocation: ', isLoggedIn);
      try {
        if (!isLoggedIn || !locationSharingEnabled) return;

        const updatedLocation = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = updatedLocation.coords;
        const prevLocation = user?.location;
        console.log('\n\nnew Location: ', { latitude, longitude });
        console.log('\n\nprevLocation: ', prevLocation);
        if (prevLocation) {
          const { latitude: prevLat, longitude: prevLon } = prevLocation;
          const distance = calculateHaversineDistance(prevLat, prevLon, latitude, longitude);
          // console.log('\n\n:---:', distance, LOCATION_THRESHOLD, distance < LOCATION_THRESHOLD);
          if (distance < LOCATION_THRESHOLD) return; // Skip update if within the threshold
        }

        await updateUserLocation({ longitude, latitude });
        dispatch(updateUserObjectLocation({ latitude, longitude }));
        console.log('\n\nEnd: Location updated: ', { longitude, latitude });
      } catch (error) {
        console.error('Failed to update location:', error);
      }
    };

    // Set interval to update location
    const intervalId = setInterval(updateLocation, LOCATION_UPDATE_INTERVAL);

    return () => clearInterval(intervalId); // Clean up on unmount
  }, [isLoggedIn, locationSharingEnabled, dispatch]);
};
