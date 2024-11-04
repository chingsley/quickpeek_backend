import React, { useEffect } from 'react';
import AppNavigator from '../navigation/AppNavigator';
import { usePermissions } from '../hooks/usePermissions';
import { useAppDispatch } from '../store';
import { useLocationUpdater } from '../hooks/useLocationUpdater';

import { initializeLocation } from '../store/slices/permissionsSlice';

const AppInitializer = () => {
  const dispatch = useAppDispatch();
  usePermissions(); // Initialize permissions once on app load
  useLocationUpdater(); // start periodic location update

  useEffect(() => {
    dispatch(initializeLocation());
  }, [dispatch]);

  return <AppNavigator />;
};

export default AppInitializer;
