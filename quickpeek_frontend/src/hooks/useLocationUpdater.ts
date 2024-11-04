import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import * as Location from 'expo-location';
import { setLocation } from '../store/slices/permissionsSlice';
import { calculateHaversineDistance } from '../utils/geo';
import { updateUserLocation } from '../services/location';

const LOCATION_UPDATE_INTERVAL = 0.2 * 60 * 1000; // 1 minutes
const LOCATION_THRESHOLD = 0.1; // Minimum distance in km to trigger an update

export const useLocationUpdater = () => {
  const dispatch = useDispatch();
  const { location: prevLocation, locationSharingEnabled } = useSelector((state: RootState) => state.permissions);
  const { isLoggedIn } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    const updateLocation = async () => {
      console.log('\n\nupdateLocation started: ', isLoggedIn);
      try {
        if (!isLoggedIn || !locationSharingEnabled) return;

        const updatedLocation = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = updatedLocation.coords;
        console.log('\n\nnew Location: ', { latitude, longitude }, '\nprevLocation: ', prevLocation);
        if (prevLocation) {
          const { latitude: prevLat, longitude: prevLon } = prevLocation;
          const distance = calculateHaversineDistance(prevLat, prevLon, latitude, longitude);
          console.log('\n\n:---:', distance, LOCATION_THRESHOLD, distance < LOCATION_THRESHOLD);
          if (distance < LOCATION_THRESHOLD) return; // Skip update if within the threshold
        }
        console.log('\n\n>>>>>>>>>> before api call');
        const res = await updateUserLocation({ longitude, latitude });
        console.log('\n\nres: ', res);
        dispatch(setLocation({ latitude, longitude }));
        console.log('\n\nLocation updated: ', { longitude, latitude });
      } catch (error) {
        console.error('Failed to update location:', error);
      }
    };

    // Set interval to update location
    const intervalId = setInterval(updateLocation, LOCATION_UPDATE_INTERVAL);

    return () => clearInterval(intervalId); // Clean up on unmount
  }, [isLoggedIn, locationSharingEnabled, dispatch]);
};
