import React from 'react';
import AppNavigator from '../navigation/AppNavigator';
import { usePermissions } from '../hooks/usePermissions';
import { useLocationUpdater } from '../hooks/useLocationUpdater';

const AppInitializer = () => {
  usePermissions(); // Initialize permissions once on app load
  useLocationUpdater(); // start periodic location update

  return <AppNavigator />;
};

export default AppInitializer;
